import * as Path from './path.js'

/**
 * Meta provides the current focused path
 * and a lazy getter at the state the path
 * should be focusing on.
 * 
 * Meta.descend is used to add one path segment
 * to the current path.
 * 
 * This is used by the proxy.
 */
export class Meta {
	__state=() => {}
	path=Path.Path.of()
	lifecycle=new Lifecycle()

	get state(){
		return this.__state()
	}

	descend(pathOp){
		let p = new Meta()
		p.__state = () => this.state
		p.path = Path.addParts(this.path, pathOp)
		return p
	}
}

/**
 * This is a proxy handler with additional
 * methods and state that are referenced
 * by the traps.
 */
export class Handler {
	// set later
	proxy=null
	dependencies=new Set()
	static empty={}
	constructor(meta=new Meta(), lifecycle=new Lifecycle()){
		this.meta = meta
		this.lifecycle = lifecycle
	}

	get $(){
		return this.meta
	}

	get $dependencies(){
		return this.dependencies
	}

	get $type(){
		return 'z4/proxy'
	}

	get $values(){
		let pp = PathProxy.of(
			this.meta.descend(new Path.Traverse(this.meta))
			, this.lifecycle
		)
		this.dependencies.add(pp)
		return pp
	}

	$all = () => {
		return this.meta.path.last.get(this.meta)
	}

	$filter = (...args) => {
		let pp = PathProxy.of(
			this.meta.descend(new Path.Filter(this.meta, ...args))
			, this.lifecycle
		)
		this.dependencies.add(pp)
		return pp
	}

	$map = (...args) => {
		let pp = PathProxy.of(
			this.meta.descend(new Path.Transform(this.meta, ...args))
			, this.lifecycle
		)
		this.dependencies.add(pp)
		return pp
	}

	$delete = () => {
		try {
			return this.meta.path.last.remove(this.meta)
		} finally {
			this.lifecycle.onremove(this)
		}
	}

	valueOf = () => {
		return this.meta.state
	}

	toString = () => {
		return this.valueOf()+''
	}

	get(_, key){
		if(typeof key == 'symbol' ) { 
			return this.meta.state[key]
		} else if ( 
			key.startsWith('$') 
			|| key == 'valueOf' 
			|| key == 'toString' 
		) {
			return this[key]
		} else {
			let s = this.meta.state
			if ( s[key] == null ) {
				s[key] = Handler.empty
			}

			let nextMeta = this.meta.descend(new Path.Property(this.meta, key)) 
			nextMeta.__state = () => this.meta.state[key]

			let pp = PathProxy.of( nextMeta, this.lifecycle )

			this.dependencies.add(pp)

			return pp
		}
	}

	set(_, key, value){
		try {
			return Reflect.set(this.meta.state, key, value)
		} finally {
			this.lifecycle.onset(this.proxy[key], value)
		}
	}

	apply(_, __, args){
			
		if( typeof this.meta.state == 'function' ) {
			return Reflect.apply(this.meta.state, ...args)
		} else if (args.length == 0) {
			return this.meta.path.last.get(this.meta)[0]
		} else if (typeof args[0] == 'function'){
			let value = args[0](this.meta.state)
			try {
				return this.meta.path.last.set({ meta: this.meta, value })
			} finally {
				this.lifecycle.onset(this.proxy, value)
			}
		} else {
			try {
				return this.meta.path.last.set({ meta: this.meta, value: args[0] })
			} finally {
				this.lifecycle.onset(this.proxy, args[0])
			}
		}
		 
	}

	deleteProperty(_, key){
		// create child or access child
		// so things like delete users.$values works
		let child = this.proxy[key]
		let worked = child.$.path.last.remove(this.meta)
		if( worked ) return worked
	
		return child[key].$delete()
	}

}

/**
 * Supported lifecycle operations.
 * 
 * These are used internally to support
 * services.
 */
export class Lifecycle {
	oncreate(){}
	onremove(){}
	onbeforecreate(){}
	onset(){}
}

/**
 * A small wrapper around the proxy
 * that includes additional metadata
 * and a custom constructor for caching.
 */
export class PathProxy {
	constructor(
		handler=new Handler()
		, meta=new Meta()
		, proxy=new Proxy(function(){})
	){
		this.handler = handler
		this.proxy = proxy
		this.meta = meta
	}

	static of(meta, lifecycle=new Lifecycle()){

		{
			let x = lifecycle.onbeforecreate({ meta })
			if( x ) return x
		}

		const handler = new Handler(meta, lifecycle)
		const proxy = new Proxy(function(){}, handler)
		handler.proxy = proxy

		let out = new PathProxy(handler, meta, proxy)

		try {
			return out.proxy
		} finally {
			lifecycle.oncreate(out)
		}
	
	}
}