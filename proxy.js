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
	__state=() => [{}]
	path=Path.Path.of()
	lifecycle=new Lifecycle()
	last=new Path.Root(this)
	get state(){
		return this.__state()
	}

	descend(PathOp, handler){
		let p = new Meta()
		p.__state = () => handler.$all()
		p.path = Path.addParts(this.path, p.last = PathOp(p))
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
			this.meta.descend( meta => new Path.Traverse(meta), this)
			, this.lifecycle
		)
		this.dependencies.add(pp)
		return pp
	}

	$filter = (...args) => {
		let pp = PathProxy.of(
			this.meta.descend( 
				meta => new Path.Filter(meta, ...args), this
			)
			, this.lifecycle
		)
		this.dependencies.add(pp)
		return pp
	}

	$map = (...args) => {
		let pp = PathProxy.of(
			this.meta.descend( meta => new Path.Transform(meta, ...args), this)
			, this.lifecycle
		)
		this.dependencies.add(pp)
		return pp
	}

	$delete = () => {
		try {
			return this.meta.path.remove({ states: this.meta.state })
		} finally {
			this.lifecycle.onremove(this)
		}
	}

	$$all = () => {
		return this.meta.path.get({ states: this.meta.state })
	}

	$all = () => {
		let a = this.proxy
		let visitor = () => this.$$all
		let out = this.lifecycle.onbeforeget( 
			a, visitor
		)
		return out
	}

	valueOf = () => {
		return this.lifecycle.onbeforeget( 
			this.proxy
			, () => this.meta.path.get({ states: this.meta.state })
		)
		[0]
	}

	toString = () => {
		return this.valueOf()+''
	}

	get(_, key){
		if(typeof key == 'symbol' ) { 
			return this.meta.state[0][key]
		} else if (
			key.startsWith('$') 
			|| key == 'valueOf' 
			|| key == 'toString' 
		) {
			return this[key]
		} else {

			let nextMeta = 
				this.meta.descend( 
					meta => new Path.Property(this.meta, meta, key), this
				) 

			let pp = PathProxy.of( nextMeta, this.lifecycle )

			this.dependencies.add(pp)

			return pp
		}
	}

	setSelf(_, proxy, visitor){
		try {
			this.lifecycle.onbeforeset(proxy)
			proxy.$.path.set({
				visitor, states: this.$$all() 
			})
			return true
		} finally {
			this.lifecycle.onset(proxy)
		}
	}

	set(_, key, value){
		let proxy = this.proxy[key]
		return this.setSelf(_, proxy, () => value)
	}

	apply(_, __, args){
			
		if( typeof this.meta.state == 'function' ) {
			return Reflect.apply(this.meta.state, ...args)
		} else if (args.length == 0) {
			return this.valueOf()
		} else if (typeof args[0] == 'function'){
			return this.setSelf(_, this.proxy, args[0])
		} else {
			try {
				return this.setSelf(_, this.proxy, () => args[0])
			} finally {
				this.lifecycle.onset(this.proxy, args[0])
			}
		}
	}

	deleteProperty(_, key){
		// create child or access child
		// so things like delete users.$values works
		let child = this.proxy[key]
		return child.$.path.remove({ states: this.meta.state })
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
	onbeforeset(){}
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