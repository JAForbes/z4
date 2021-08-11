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
	last=new Path.Root(this)
	get state(){
		return this.__state()
	}

	descend(pathOp){
		let p = new Meta()
		p.__state = () => this.state
		p.path = Path.addParts(this.path, pathOp)
		p.last = pathOp
		return p
	}
}

// An object that was created
// as a placeholder during traversal
// can hold values
// but when is set by a user
// we record it so notifications
// can skip on user initialized data
export class Initial {
	length = 0
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
			return this.meta.last.remove(this.meta)
		} finally {
			this.lifecycle.onremove(this)
		}
	}

	
	$all = () => {
		return this.lifecycle.onbeforeget( 
			this.proxy
			, () => this.meta.last.get(this.meta)
		)
	}

	valueOf = () => {
		return this.lifecycle.onbeforeget( 
			this.proxy
			, () => this.meta.last.get(this.meta)
		)
		[0]
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
				s[key] = new Initial()
			}

			let nextMeta = this.meta.descend(new Path.Property(this.meta, key)) 
			nextMeta.__state = () => this.meta.state[key]

			let pp = PathProxy.of( nextMeta, this.lifecycle )

			this.dependencies.add(pp)

			return pp
		}
	}

	set(_, key, value){
		let proxy = this.proxy[key]
		let prev = proxy.valueOf()
		if (prev == value) return true
		try {
			if( value instanceof Initial) value = {}
			proxy.$.path.last.set({ meta: this.meta, value })
			return true
		} finally {
			this.lifecycle.onset(proxy, value)
		}
	}

	apply(_, __, args){
			
		if( typeof this.meta.state == 'function' ) {
			return Reflect.apply(this.meta.state, ...args)
		} else if (args.length == 0) {
			return this.valueOf()
		} else if (typeof args[0] == 'function'){
			let prev = this.valueOf()
			let value = args[0](prev)
			if (prev == value) return true
			try {
				if( value instanceof Initial) value = {}
				return this.meta.last.set({ meta: this.meta, value })
			} finally {
				this.lifecycle.onset(this.proxy, value)
			}
		} else {
			try {
				let prev = this.valueOf()
				let value = args[0]
				if (prev == value) return true
				if( value instanceof Initial) value = {}
				return this.meta.last.set({ meta: this.meta, value: args[0] })
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
	onbeforeget(_, f){ return f() }
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