import Hyperscript from './h.js'
import Component from './component.js'
import * as Proxy from './proxy.js'

export default class Z4 extends Proxy.Lifecycle {
	subscriptions = {}
	proxies = {}
	
	constructor(state={}){
		super()

		this.meta = new Proxy.Meta()
		this.meta.__state = () => state

		this.root = Proxy.PathProxy.of(
			this.meta
			, this
		)
	
		this.hyperscript = Hyperscript(this)
	}
	
	oncreate({ proxy, meta }){
		this.proxies[ meta.path.key ] = proxy
	} 
	
	onbeforecreate({ meta }){
		if( this.proxies[meta.path.key] ) {
			return this.proxies[meta.path.key]
		}
		return null
	}
	
	get state(){
		return this.root
	}

	on(dependencies, visitor){
		let s = { type: 'change', visitor, dependencies }
		
		for( let d of dependencies){
			let key = d.key
			this.subscriptions[key] = this.subscriptions[key] || []
			this.subscriptions[key].push(s)
		}
	}

	off(dependencies, visitor){
		
		for( let d of dependencies ){
			let key = d.key
			this.subscriptions[key] = this.subscriptions[key] || []
			let i = this.subscriptions[key].findIndex( x => x.visitor ==visitor )
			i > -1 && this.subscriptions[key].splice(1, i)
		}
	}

	get Component(){
		return Component
	}
}
