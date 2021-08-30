/* globals clearTimeout, setTimeout */
import Hyperscript from './h.js'
import Component from './component.js'
import * as Proxy from './proxy.js'
import { Path } from './path.js'
import Transaction from './transaction.js'

class Service {
	constructor(
		dependencies
		, visitor
		, options={ resolve: 'latest' }
		, key
	) {
		this.dependencies = dependencies
		this.visitor = visitor
		this.options = options
		this.key = key
		this.cancellations = new Set()
	}

	end(){

	}
}

export default class Z4 extends Proxy.Lifecycle {
	subscriptions = Object.create(null)
	proxies = Object.create(null)
	dependencies = Object.create(null)
	dependents = Object.create(null)
	
	cachedSubscriptions = Object.create(null)
	cachedValues = new Map()

	// a key value idx of all proxies
	// should be a map
	proxyCache = Object.create(null)
	
	// literal memory references
	// to all proxies so we can quickly
	// detect if a value is one of our
	// proxies
	proxyReferences = new WeakSet()
	

	transactions = new Map()
	services = new Map()

	setTimeout = setTimeout
	clearTimeout = clearTimeout
	timers = new Map()

	constructor(state={}, queryKeyReferences=new Map(), isTransaction=false){
		super()

		this.path = Path.of()
		this.isTransaction = isTransaction
		this.queryKeyReferences = queryKeyReferences
		this.root = Proxy.PathProxy.of(
			this.path
			, this
			, () => [state]
			, this.proxyCache
			, this.proxyReferences
			, this.queryKeyReferences
		)
	
		this.hyperscript = Hyperscript(this)
	}

	service(
		dependencies=[]
		, visitor=function * (){}
		, options={ resolve: 'latest' }
		, key=`z.service([${dependencies.map( x => x.$path.key )}], ${visitor.toString()})`
	){
		if( ! this.services.has(key) ) {
			let service = new Service(dependencies, visitor, options, key)
			this.services.set(key, service)

			// we only need to associate our explicit dependencies
			// with this service
			// then the notifcations function will figure out
			// all the nodes that could be affected by a write
			// and if any of those nodes have a subscription
			// ours will execute.
			for( let d of dependencies){
				let key = d.$path.key
				this.subscriptions[key] = this.subscriptions[key] || []
				this.subscriptions[key].push(service)
			}

			let ready = dependencies.every( x => {
				let y = x.valueOf()
				
				return !(typeof y == 'undefined')
			} )

			if( ready ) {
				let t = new Transaction(this, visitor)
				this.transactions.set(key, t)
				t.run().catch( () => {} )
			}
		}
		
		return this.services.get(key)
	}

	/**
	 * For a given query key, return a list of all
	 * services that should be executed.
	 * 
	 */
	notifications(key){

		if( this.isTransaction || !(key in this.dependents)) {
			return new Set()
		} else {
			// 1. Get list of dependencies
			// 2. Add to that list
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
	}
	
	clearValueCache(){
		this.cachedValues.clear()
		for( let t of this.transactions.values() ) {
			t.z.cachedValues.clear()
		}
	}

	onset(handler, states){
		this.clearValueCache()
		
		let key = handler.path.key
		this.cachedValues.set(key, states)

		for( let service of this.notifications(key) ){
			let t;
			let key = service.key
			let existing = this.transactions.get(key)
			let { resolve } = service.options

			let preferLatest = resolve != 'earliest'
			let debounce = resolve.debounce || 0

			// whether or not to create a new transaction
			// and if we should cancel the running one
			if( preferLatest && existing && !existing.ended ) {
				service.cancellations.add(existing)
				t = new Transaction(this, service.visitor, service.options)
				this.transactions.set(key, t)
			} else if( !existing || existing.ended ) {
				t = new Transaction(this, service.visitor, service.options)
				this.transactions.set(key, t)
			} else {
				t = existing
			}


			if( t.pending ) {
				// scheduling the new or existing pending
				// if required
				if ( existing && debounce > 0 ) {
					if( this.timers.has(key)) {
						let { id } = this.timers.get(key)
						this.clearTimeout(id)
					}
					
					let id = this.setTimeout(() => {
						for( let existing of service.cancellations ) {
							existing.cancel()
						}
						service.cancellations.clear()
						t.run().catch(() => {})
						this.timers.delete(key)
					}, debounce)
	
					this.timers.set(key, { id, at: Date.now(), ms: debounce })
				} else {
					if( existing ) {
						existing.cancel()
						service.cancellations.clear()
					}
					// otherwise run the new one immediately
					t.run().catch( () => {} )
				}
			}
			// could just already have started 
			// with preferLatest=false
			
		}
	}

	/**
	 * Returns a promise that resolves the moment
	 * all transactions that were
	 * 
	 */
	drain(){
		return Promise.all(
			Array.from(this.transactions.values())
				.filter( x => x.running ).map( x => x.promise )
		)
		.then( () => null, () => null )
	}

	onbeforeset(handler, visitor){
		let key = handler.path.key

		if ( this.cachedValues.has(key) ) {
			for(let state of this.cachedValues.get(key) ){
				if( state == visitor(state) ) return false;
			}
		}

		return true;
	}

	onbeforeget(handler, getter){
		let path = handler.path
		let key = path.key

		if ( !this.cachedValues.has(key) ) {
			let got = getter()
			this.cachedValues.set(key, got)
		}
		return this.cachedValues.get(key)
	}

	onremove(){
		this.cachedSubscriptions = {}
		this.clearValueCache()
	}
	
	oncreate({ proxy=new Proxy.Handler(), path=Path.of() }){
		// Anytime a new proxy is created, we clear the subscription
		// cache.  We can optimize this later if benchmarks show
		// this is even an issue.
		this.cachedSubscriptions = {}
		this.clearValueCache()

		let key = path.key
		this.proxies[ key ] = proxy
		this.proxyReferences.add(proxy)

		if( !this.isTransaction ) {

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

	get Component(){
		return Component
	}
}
