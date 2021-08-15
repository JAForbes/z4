import Hyperscript from './h.js'
import Component from './component.js'
import * as Proxy from './proxy.js'
import { Path } from './path.js'

export default class Z4 extends Proxy.Lifecycle {
	subscriptions = Object.create(null)
	proxies = Object.create(null)
	dependencies = Object.create(null)
	dependents = Object.create(null)
	
	cachedSubscriptions = Object.create(null)
	cachedValues = new Map()

	proxyCache = Object.create(null)

	constructor(state={}){
		super()

		this.path = Path.of()

		this.root = Proxy.PathProxy.of(
			this.path
			, this
			, () => [state]
			, this.proxyCache
		)
	
		this.hyperscript = Hyperscript(this)
	}

	notify(key){
		if( key in this.cachedSubscriptions ) return this.cachedSubscriptions[key]
		let subs = new Set()
		let xs = [key, ...this.dependents[key]]
		for(let dep of xs){
			if (!(dep in this.subscriptions)) continue;
			
			outer: for(let sub of this.subscriptions[dep]){
				for(let dep of sub.dependencies){
					if( dep() == undefined ) break outer;
				}
				subs.add(sub)
			}
		}

		this.cachedSubscriptions[key] = subs
		return subs
	}

	onset(handler, states){
		this.cachedValues.clear()
		
		let key = handler.$path.key
		this.cachedValues.set(key, states)

		for( let sub of this.notify(key) ){
			sub.visitor()
		}
	}

	onbeforeget(proxy, getter){
		let path = proxy.$path
		let key = path.key

		if ( !this.cachedValues.has(key) ) {
			let got = getter()
			this.cachedValues.set(key, got)
		}
		return this.cachedValues.get(key)
	}

	onremove(){
		this.cachedSubscriptions = {}
		this.cachedValues.clear()
	}
	
	oncreate({ proxy=new Proxy.Handler(), path=Path.of() }){
		// Anytime a new proxy is created, we clear the subscription
		// cache.  We can optimize this later if benchmarks show
		// this is even an issue.
		this.cachedSubscriptions = {}
		this.cachedValues.clear()

		let key = path.key
		this.proxies[ key ] = proxy

		// if these queries update, tell me about it.
		let dependencies = new Set()

		// take all the dependencies from my parents
		// by grabbing the dependencies from my parent
		// if I have dependencies, we'll check theirs as well
		let search = [
			...path.prev ? [path.parts.slice(0,-1).join('.')] : []
			, ...path.dependencies.map( x => x.$path.key )
		]

		// start with my parents
		
		for(let key of search){
			dependencies.add(key)

			// should always exist
			if( this.dependencies[key] ) {
				for( let x of this.dependencies[key]){
					dependencies.add(x)
				}
			}
			
		}

		// did me being created require other dependencies to
		// be updated, in other words, am I their trigger and they don't know?
		// to find out, I need to check if any of my children
		// were referenced by other queries - but wait! that is not possible
		// you can't access a child query without creating the parent first
		// and when the child is created and referenced by the other 
		// query it will find out about me
		// the only way this can get out of sync is if a proxy is deleted

		this.dependencies[key] = dependencies
		// now we know what fields will trigger this field, we can optimize
		// access for those trigger entry points by inverting the index
		// as an optimization we can do this while we're looping (later)
		
		// ensure all keys have a dependents entry
		this.dependents[key] = new Set()

		// invert the index
		for( let x of dependencies ) {
			this.dependents[x].add(key)
		}

		// now when something writes, we can look who is a dependent
		// and check if they have any subscriptions as we iterate
		// this also acts as a simple list of sets to remove ourselves from
		// when we are deleted
	} 
	
	onbeforecreate({ path }){
		if( this.proxies[path.key] ) {
			return this.proxies[path.key]
		}
		return null
	}
	
	get state(){
		return this.root
	}

	on(dependencies, visitor){
		let s = { visitor, dependencies }
		
		for( let d of dependencies){
			let key = d.$path.key
			this.subscriptions[key] = this.subscriptions[key] || []
			this.subscriptions[key].push(s)
		}

		let ready = dependencies.every( x => {
			let y = x.valueOf()
			
			return !(typeof y == 'undefined')
		} )

		if( ready ) {
			visitor()
		}
	}

	off(dependencies, visitor){
		
		for( let d of dependencies ){
			let key = d.key
			this.subscriptions[key] = this.subscriptions[key] || []
			let i = this.subscriptions[key].findIndex( x => x.visitor == visitor )
			i > -1 && this.subscriptions[key].splice(1, i)
		}
	}

	get Component(){
		return Component
	}
}
