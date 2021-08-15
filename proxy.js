import * as Path from './path.js'

/**
 * This is a proxy handler with additional
 * methods and state that are referenced
 * by the traps.
 */
export class Handler {
	// set later
	proxy=null
	dependencies=new Set()
	constructor(path=Path.of(), lifecycle=new Lifecycle(), getRootStates, cache){
		this.path = path
		this.lifecycle = lifecycle
		this.getRootStates = getRootStates
		this.cache = cache
	}

	get $path(){
		return this.path
	}

	get $dependencies(){
		return this.dependencies
	}

	get $type(){
		return 'z4/proxy'
	}

	get $values(){
		let pp = PathProxy.of(
			Path.addParts( this.path, new Path.Traverse() )
			, this.lifecycle
			, this.getRootStates
			, this.cache
		)
		this.dependencies.add(pp)
		return pp
	}

	$filter = (...args) => {
		let pp = PathProxy.of(
			Path.addParts( this.path, new Path.Filter(...args) )
			, this.lifecycle
			, this.getRootStates
			, this.cache
		)
		this.dependencies.add(pp)
		return pp
	}

	$map = (...args) => {
		let pp = PathProxy.of(
			Path.addParts( this.path, new Path.Transform(...args) )
			, this.lifecycle
			, this.getRootStates
			, this.cache
		)
		this.dependencies.add(pp)
		return pp
	}

	$delete = () => {
		let worked = this.path.remove({ states: this.getRootStates() })
		if(worked) {
			this.lifecycle.onremove(this)
		}

		// return true or proxy flips out
		return true
	}

	$$all = () => {
		return this.path.get({ states: this.getRootStates() })
	}

	$all = () => {
		let a = this.proxy
		let visitor = () => this.$$all()
		let out = this.lifecycle.onbeforeget( 
			a, visitor
		)
		return out
	}

	valueOf = () => {
		return this.lifecycle.onbeforeget( 
			this.proxy
			, () => this.path.get({ states: this.getRootStates() })
		)
		[0]
	}

	toString = () => {
		return this.valueOf()+''
	}

	get(_, key){

		if( key in this.cache ) {
			return this.cache[key]
		} else if(typeof key == 'symbol' ) { 
			let value = this.valueOf()
			if( typeof value == 'undefined'){
				return undefined
			} else {
				return value[key]
			}
			// assumes not empty
		} else if (
			key.startsWith('$') 
			|| key == 'valueOf' 
			|| key == 'toString' 
		) {
			return this[key]
		} else {

			
			let newPath = Path.addParts( this.path, new Path.Property(key))
			let pp = PathProxy.of( 
				newPath
				, this.lifecycle
				, this.getRootStates 
				, this.cache
			)

			this.dependencies.add(pp)

			this.cache[newPath.key] = pp
			return pp
		}
	}

	setSelf(_, proxy, visitor){
		
		let allowed = this.lifecycle.onbeforeset(proxy, visitor)
		if( !allowed ) {
			return;
		}
		let response = 
			proxy.$path.set({
				visitor, states: this.getRootStates() 
			})

		if (response.updated) {
			this.lifecycle.onset(proxy, response.states)
		}
	}

	set(_, key, value){
		let proxy = this.proxy[key]
		this.setSelf(_, proxy, () => value)

		// return true or proxy flips out
		return true
	}

	apply(_, __, args){

		let existing = this.valueOf()
			
		if( typeof existing == 'function' ) {
			return Reflect.apply(existing, args)
		} else if (args.length == 0) {
			return existing
		} else if (typeof args[0] == 'function'){
			return this.setSelf(_, this.proxy, args[0])
		} else {
			let worked = this.setSelf(_, this.proxy, () => args[0])
			if (worked) {
				this.lifecycle.onset(this.proxy, args[0])
			}
			return worked
		}
	}

	deleteProperty(_, key){
		// create child or access child
		// so things like delete users.$values works
		let child = this.proxy[key]
		return child.$delete()
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
	onbeforeset(){ return true }
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
		, path=Path.of()
		, proxy=new Proxy(function(){})
		, getRootStates
	){
		this.handler = handler
		this.proxy = proxy
		this.path = path
		this.getRootStates = getRootStates
	}

	static of(path, lifecycle=new Lifecycle(), getRootStates, proxycache){

		{
			let x = lifecycle.onbeforecreate({ path })
			if( x ) return x
		}

		const handler = new Handler(path, lifecycle, getRootStates, proxycache)
		const proxy = new Proxy(function(){}, handler)
		handler.proxy = proxy

		let out = new PathProxy(handler, path, proxy, getRootStates, proxycache)

		try {
			return out.proxy
		} finally {
			lifecycle.oncreate(out)
		}
	
	}
}