const paths = {}

/**
 * Every query in Z has a name or "key".
 * 
 * Each operation in a query has its own key.
 * 
 * The query key is formed by joining the key of all 
 * its segments.
 * 
 * The raw information is simply a list of PathOperation
 * but for performance we cache some commonly accessed
 * information.
 * 
 * That information is stored in a Path object.
 * 
 */
export class Path {
	parts=[]
	key=''
	staticParts=[]
	dependencies=new Set()
	rank=Infinity
	constructor(xs=[]){
		this.parts = xs
		this.key = xs.join('.')
		
		this.last = xs[xs.length-1]
		this.prev = xs[xs.length-2]
		this.staticParts = this.parts.filter( x => x.isStatic )
		this.staticKey = this.staticParts.join('.')
		this.rank = Math.max(...this.parts.map( x => x.rank ))
		this.dynamic = this.staticParts.length != this.parts.length
		this.static = !this.dynamic
		this.dependencies = this.last ? this.last.dependencies : []
	}
	concat(xs) {
		return Path.of( this.parts.concat(xs.parts) ) 
	}
	static of(xs=[]){
		let key = xs.join('.')
		if( key in paths ) {
			return paths[key]
		} else {
			return new Path(xs)
		}
	}

	set({ states, visitor }){
		let stack = this.parts.slice(0, -1)
		let nextOp;
		let finalOp = stack.parts.slice(-1)[0]
		states = states.slice()
		let staticRemaining = this.staticParts.length

		// skip the setup
		if ( this.parts.length == 1 ) stack = []
		
		outer: while ( nextOp = stack.shift() ) {
			
			inner: for( let i = 0; i < states.length; i++ ) {

				if( nextOp instanceof Root) {
					// no-op	
				} else if ( nextOp instanceof Property ) {
					if( typeof states[i][nextOp.key] == 'undefined' && staticRemaining > 0 ) {
						states[i][nextOp.key] = {}
					}
					// focus on a new state
					states[i] = states[i][nextOp.key]
				} else if ( nextOp instanceof Transform ) {
					// we can't set if there is a transform
					// so break
					break outer
				} else if ( nextOp instanceof Traverse ) {
					states = states.flatMap( x => x )
				} else if ( nextOp instanceof Filter ) {
					let [ready, deps] = nextOp.ready()

					if (!ready) break outer;

					let match = nextOp.visitor(nextOp, ...deps)
					if( !match ) states[i] = undefined
					
				} else {
					throw 'lol?'
				}
			}
			
			if( nextOp instanceof Filter ) {
				states = states.filter( x => typeof x == 'undefined' )
			}

			if( nextOp.isStatic ) staticRemaining--
		}

		// exited early
		if( stack.length ) return false;

		// final write
		if ( finalOp ) {

			if( finalOp instanceof Root ) {
				for( let i = 0; i < states.length; i++ ) {
					states[i] = visitor(states[i])
				}
			} else if ( finalOp instanceof Property ) {
				for( let i = 0; i < states.length; i++ ) {
					states[i] = visitor(states[i][finalOp.key])
				}
			} else if ( finalOp instanceof Transform ) {
				return false;
			} else if ( finalOp instanceof Traverse ) {
				states = states.flatMap( x => visitor(x) )
			}

			return true
		}

		return false
	}
	
	get({ states }){
		let stack = this.parts.slice(0, -1)
		let nextOp;
		let finalOp = stack.parts.slice(-1)[0]
		states = states.slice()
		let staticRemaining = this.staticParts.length

		// skip the setup
		if ( this.parts.length == 1 ) stack = []
		
		outer: while ( nextOp = stack.shift() ) {
			
			inner: for( let i = 0; i < states.length; i++ ) {

				if( nextOp instanceof Root) {
					// no-op	
				} else if ( nextOp instanceof Property ) {
					if( typeof states[i][nextOp.key] == 'undefined' && staticRemaining > 0 ) {
						states[i][nextOp.key] = {}
					}
					// focus on a new state
					states[i] = states[i][nextOp.key]
				} else if ( nextOp instanceof Transform ) {
					let [ready, deps] = nextOp.ready()

					if (!ready) break outer;

					states[i] = nextOp.visitor(states[i], ...deps)
				} else if ( nextOp instanceof Traverse ) {
					states = states.flatMap( x => x )
				} else if ( nextOp instanceof Filter ) {
					let [ready, deps] = nextOp.ready()

					if (!ready) break outer;

					let match = nextOp.visitor(nextOp, ...deps)
					if( !match ) states[i] = undefined
					
				} else {
					throw 'lol?'
				}
			}
			
			if( nextOp instanceof Filter ) {
				states = states.filter( x => typeof x == 'undefined' )
			}

			if( nextOp.isStatic ) staticRemaining--
		}

		// exited early
		if( stack.length ) return false;

		// final write
		if ( finalOp ) {

			chain: if( finalOp instanceof Root ) {
				// no-op
			} else if ( finalOp instanceof Property ) {
				for( let i = 0; i < states.length; i++ ) {
					states[i] = states[i][finalOp.key]
				}
			} else if ( finalOp instanceof Transform ) {
				let [ready, deps] = nextOp.ready()

				if (!ready) {
					states = []; break chain;
				}

				for( let i = 0; i < states.length; i++ ) {
					states[i] = finalOp.visitor(states[i], ...deps)
				}
			} else if ( finalOp instanceof Traverse ) {
				states = states.flatMap( x => x )
			}

			return states
		}

		return []
	}
	remove({ states }){
		let stack = this.parts.slice(0, -1)
		let nextOp;
		let finalOp = stack.parts.slice(-1)[0]
		states = states.slice()

		let traverseParent = new Map()

		// skip the setup
		if ( this.parts.length == 1 ) stack = []
		
		outer: while ( nextOp = stack.shift() ) {
			
			inner: for( let i = 0; i < states.length; i++ ) {

				if( nextOp instanceof Root) {
					// no-op
				} else if ( nextOp instanceof Property ) {
					if( typeof states[i][nextOp.key] == 'undefined' ) {
						// we wanted to delete a child path
						// but even the parent path doesn't exist
						// so job done
						return true;
					}

					// focus on a new state
					states[i] = states[i][nextOp.key]
				} else if ( nextOp instanceof Transform ) {
					// if a query has a transform in it
					// it cannot be deleted or set
					// fail early
					return false
				} else if ( nextOp instanceof Traverse ) {
					// lift values into result set
					// we might do a filter afterwards
					// before deleting so we need to focus
					// on the right state
					let newStates = []
					for( let i = 0; i < states.length; i++){
						// eslint-disable-next-line max-depth
						for( let j = 0; j < states[i].length; j++ ) {
							let x = states[i][j]
							// we want the first real parent
							// eslint-disable-next-line max-depth
							if( !traverseParent.has(states[i])) {
								traverseParent.set(x, { parent: states[i], index: j })
							}
							newStates.push(x)
						}
					}
					states = newStates
				} else if ( nextOp instanceof Filter ) {
					let [ready, deps] = nextOp.ready()

					if (!ready) break outer;

					let match = nextOp.visitor(nextOp, ...deps)
					if( !match ) {
						states[i] = undefined
					} else {
						// we want the first real parent
						// eslint-disable-next-line max-depth
						if( !traverseParent.has(states[i])) {
							traverseParent.set(states[i], { parent: states, index: i })
						}
					}

					
				} else {
					throw 'lol?'
				}
			}
			
			if( nextOp instanceof Filter ) {
				states = states.filter( x => typeof x == 'undefined' )
			}

		}

		// exited early
		if( stack.length ) return false;

		// final write
		if ( finalOp ) {

			if( finalOp instanceof Root ) {
				// no-op
				return true
			} else if ( finalOp instanceof Property ) {
				for( let i = 0; i < states.length; i++ ) {
					delete states[i][finalOp.key]
				}
				return true
			} else if ( finalOp instanceof Transform ) {
				return false;
			} else if ( finalOp instanceof Traverse ) {
				// if we are deleting a traverse
				// we want to clear the list each value originally
				// belonged to
				// but how can we _know_ what list the state
				// originally belonged to
				// e.g. if we filter a result set, then
				// run $values to lift the result set
				// we won't know which state to modify
				// we can't just go back to the last key
				// and clear all lists from all states
				// as a predicate might have opted a state out
				// or maybe we just need to go back to the last
				// real key, re apply all filters along the way
				// on each item, but not actually flatten the list
				// to do that, we'd need to be able to account
				// for repeated .$values.$values as an array
				// could be n-dimensional
				// maybe everytime we traverse, we store the real path
				// of each object in the real state list
				// then we can identify what array to splice?

				// if there was a $values before this one
				// we'll capture the original state location
				// so we can edit it in place
				if( traverseParent.size() > 0 ) {

					let stateSpliceOffset = new Map()

					for( let state of states ){
						let { parent, index } = traverseParent.get(state)
						
						let offset = stateSpliceOffset.get(parent) || 0
						// edit the list in place
						parent.splice(index-offset, 1)
						stateSpliceOffset.set(parent, offset+1)
					}

				// otherwise this is the only usage of .$values
				// in the path, and therefore we can just clear the list
				// at the current address by setting its length to 0
				// except this doesn't account for filtered lists
				// if a list was filtered, we're just setting
				// the filtered list length to 0, not actually removing
				// the item from the original list
				} else {
					for( let state of states ) {
						state.length = 0
					}
				}
			}

			return true
		}

		return false
	}
}

export function addParts(path, ...parts){
	return path.concat(Path.of(parts))
}

/**
 * An Op is an abstraction over a way to query data.
 * 
 * E.g. filtering data is an op, transforming data
 * is an op.  Accessing a sub property is an op.
 * 
 * By abstracting away these operations into
 * a shared API we can extend what Z can do
 * with little effort.
 * 
 * An op needs to be able to tell Z how to do the following
 * 
 * - get
 * - set
 * - remove
 * 
 * Not all Op's have implementations for these behaviours.
 * E.g. `Transform` is a read only `Op` so `set` and `remove`
 * are no-ops.
 * 
 * This is just a base class, merely here to document the API
 * has no real runtime benefit.
 */
export class Op { 
	rank = 0 
	key = ''
	dependencies = []
	isStatic = true
	set(){ throw new Error('Unsupported')}
	get(){ throw new Error('Unsupported')}
	remove(){ throw new Error('Unsupported')}
	ready(){
		let deps = this.dependencies.map( x => x.valueOf() )

		let ready = deps.every( x => {
			return !(typeof x == 'undefined')
		} )

		return [ready, deps]
	}

	toString(){
		return this.key
	}
}

/**
 * This handles access when the path list is empty.
 */
export class Root extends Op {
	rank = 1
	isStatic = true
	key = ''
	
	constructor(meta){
		super()
		this.meta = meta
	}

	get state(){
		return this.meta.state
	}
}

/**
 * This class represents dot chaining into
 * properties.
 */
export class Property extends Op {
	rank = 1
	isStatic = true
	constructor(parentMeta, meta, key){
		super()
		this.key = key
		this.meta = meta
		this.parentMeta = parentMeta
	}

	get state(){
		return this.meta.state.map( x => x[this.key])
	}

}

/**
 * This represents a read transformation.
 * 
 * It is not bidirectional like most other Operations.
 * 
 */
export class Transform extends Op {
	rank = 2
	isStatic = false
	
	constructor(meta, visitor, dependencies=[], theirKey=visitor.toString() ){
		super()
		this.visitor = visitor
		this.meta = meta
		this.key = `$map(${theirKey}, [${dependencies.map( x => x.$.path.key ).join(',')}])`
		this.dependencies = dependencies
	}
}

/**
 * Like a where clause in SQL, in Z we can filter a result set.
 * 
 * This doesn't mean we're filtering a list in your state, it
 * can reduce the result set for any query.
 * 
 * In order to filter an actual list or object in your tree
 * you must use the `Traverse` Op first to lift a value
 * into the result set scope.
 * 
 */
export class Filter extends Op {
	rank = 3
	isStatic = false
	constructor(
		meta, visitor, dependencies=[], theirKey=visitor.toString() 
	){
		super()
		this.visitor = visitor
		this.key = `$filter(${theirKey}, [${dependencies.map( x => x.$.path.key ).join(',')}])`
		this.meta = meta
		this.dependencies = dependencies
	}
}

/**
 * Simply lifts a list in the state tree
 * to be the result set.  Similar to the `unnest` function in SQL.
 */
export class Traverse extends Op {
	rank = 4
	isStatic = false
	key="$values"
	constructor(meta){
		super()
		this.meta = meta
	}
}