import Hyperscript from './h.js'
import * as Path from './path.js'
import Component from './component.js'

export default function Z4({ state: __state__={} }){
	
	let subscriptions = {}
	
	function PathProxy({ state, path=new Path.Path(), proxies={} }){
		let meta = { state, path }

		if( proxies[ path.key ]) {
			return proxies[ path.key ]
		}

		let out = new Proxy(function(){}, {
			get(_, key){
				if(typeof key == 'symbol' ) { 
					return state[key]
				} else if ( key == 'valueOf' || key == 'toString' ) {
					return () => state[key]()
				} else if (key == '$') {
					return meta
				} else if (key == '$type' ) {
					return 'z4/proxy'
				} else {

					__state__
					if ( state[key] == null ) {
						state[key] = {}
					}

					return PathProxy({
						state: state[key]
						, path: path.concat(key)
						, proxies
					})
				}

			},
			set(_, key, value){
				return Reflect.set(state, key, value)
			},
			apply(_, ...args){

				if( typeof state == 'function' ) {
					return Reflect.apply(state, ...args)
				}
				return out
			},
			deleteProperty(_, key){
				return Reflect.deleteProperty(state, key)
			}
		})
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
 
	let state = PathProxy({ state: __state__ })

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