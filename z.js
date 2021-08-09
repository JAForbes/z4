import Hyperscript from './h.js'
import * as Path from './path.js'
import Component from './component.js'

export default function Z4({ state: __state__={} }={}){
	
	let subscriptions = {}
	
	function PathProxy({ getState, path=new Path.Path(), proxies={} }){
		let meta = { 
			get state(){ 
				return getState() 
			}
			, path 
		}

		if( proxies[ path.key ]) {
			return proxies[ path.key ]
		}

		let proxyHandler = {
			get(_, key){
				if(typeof key == 'symbol' ) { 
					return getState()[key]
				} else if ( key == 'valueOf' || key == 'toString' ) {
					return () => getState()[key]()
				} else if (key == '$') {
					return meta
				} else if (key == '$type' ) {
					return 'z4/proxy'
				} else if (key == '$all') {
					return () => path.last.get({ getState })
				} else if ( key == '$values' ) {
					return PathProxy({
						getState
						, path: path.concat([new Path.Traverse(getState)])
						, proxies
					})
				} else if ( key == '$filter' ) {
					return (...args) => {
						return PathProxy({
							getState
							, path: path.concat([new Path.Filter(getState, ...args)])
							, proxies
						})
					}
				} else if ( key == '$map' ) {
					return (...args) => {
						return PathProxy({
							getState
							, path: path.concat([new Path.Transform(getState, ...args)])
							, proxies
						})
					}
				} else if ( key == '$delete' ) {
					return () => path.last.remove({ getState })
				} else {
					if ( getState()[key] == null ) {
						getState()[key] = {}
					}

					let ourGetState = () => getState()[key]
					return PathProxy({
						getState: ourGetState
						, path: path.concat([ new Path.Property(getState, key) ])
						, proxies
					})
				}

			},
			set(_, key, value){
				return Reflect.set(getState(), key, value)
			},
			apply(_, thisArg, args){
				// todo-james come back and clean up 
				// repeated getState calls, but safely
				let getState = () => path.last.state
				getState()
				if( typeof getState() == 'function' ) {
					return Reflect.apply(getState(), ...args)
				} else if (args.length == 0) {
					return path.last.get({ getState })[0]
				} else if (typeof args[0] == 'function'){
					return path.last.set({ getState, value: args[0](getState()) })
				} else {
					return path.last.set({ getState, value: args[0] })
				}
			},
			deleteProperty(_, key){
				// create child or access child
				// so things like delete users.$values works
				let child = out[key]
				let worked = child.$.path.last.remove({ getState })
				if( worked ) return worked
			
				return path.last.remove({ getState })
			}
		}

		let out = new Proxy(function(){}, proxyHandler)
		proxies[ path.key ] = out
		return out
	}
	
	// new idea for z (hence Z4)
	//
	// 1. Updates are not recursive
	// 2. Each point in a tree can have a different update sequence
	// 3. Each point in a tree maintains a final ordered list of nodes to update
	// 4. When a new node is created, those maintained lists need to be recomputed
	// 5. This makes Z efficient for writes and reads but not for create
	//
	// When a new node is created, any node that has this nodes parent in its 
	// update list, needs to be recomputed, as it may now need to include this new node
	//
	// Maintained list:
	// 
	// There are two lists that are maintained
	//
	// 1. Nodes that should include you in their propagation
	// 2. Nodes that you should include in your propagation
	//
	// 1. all direct parents are subscribed
	// 2. all descendants are subscribed
	// 3. A dynamic query can access any child within a visitor so any change to any child could theoretically
	// require recomputing a dynamic node.
	// 4. If a node has a dynamic parent, it is also considered to be dynamic.
	// 5. Updates start at the top of the state tree and work down level by level
	// 6. Dynamics are updated after static values for each level in a tree.
	//
	// a.$values.$filter(...).x
	
	let values = {}
 
	let state = PathProxy({ getState: () => __state__ })

	function on(event, proxies, visitor){
		// subscriptions[key] = subscriptions[key] || []
		// subscriptions[key].push({ type: 'change', visitor: f })
	}

	function off(event, proxies, visitor){
		// if ( key in subscriptions ) {
		// 	let i = subscriptions[key].findIndex( x => x.visitor == f && x.type == type )  
		// 	if ( i > -1 ) {
		// 		subscriptions.splice(i, 1)
		// 	}
		// }
	}
	
	let z = { state, Path, Component, subscriptions, on, off }
	let hyperscript = Hyperscript({ z })
	z.hyperscript = hyperscript
	return z
}