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
		let finalOp = this.parts.slice(-1)[0]
		states = states.slice()
		let staticRemaining = this.staticParts.length

		let parents = []

		// skip the setup
		if ( this.parts.length == 1 ) stack = []
		let transactionDetected = false
		
		while ( nextOp = stack.shift() ) {
			
			inner: 
			if( nextOp instanceof Root) {
				// no-op	
				parents = states.slice()
			} else if ( nextOp instanceof Property ) {
				parents = states.slice()
				for( let i = 0; i < states.length; i++ ) {
					// we need to be transaction aware here
					// check if a value is undefined is not enough
					// we need to check if our own property is undefined
					// then check if the value is undefined on the prototype
					// if it exists on the prototype, we need to clone
					// if it is just undefined, we need to create it

					let ownProp = states[i].hasOwnProperty(nextOp.key)
					let isUndefined = typeof states[i][nextOp.key] == 'undefined'
					let notLeaf = staticRemaining > 0
					if( 
						isUndefined
						&& notLeaf 
					) {
						states[i][nextOp.key] = {}
					} else if (
						!ownProp
						&& !isUndefined
						&& notLeaf
					) {
						transactionDetected = true
						let o = states[i][nextOp.key]
						
						// eslint-disable-next-line max-depth
						if( Array.isArray(o) ) {
							states[i][nextOp.key] = states[i][nextOp.key].map( x => x )
						} else {
							// proto clone object
							states[i][nextOp.key] = Object.create(states[i][nextOp.key])
						}
					}
					// focus on a new state
					states[i] = states[i][nextOp.key]
				}
			} else if ( nextOp instanceof Transform ) {
				// we can't set if there is a transform
				// so break
				return { updated: false }
			} else if ( nextOp instanceof Traverse ) {
				let newStates = []
				let newParents = []
				for( let i = 0; i < states.length; i++){
					// eslint-disable-next-line max-depth
					for( let j = 0; j < states[i].length; j++ ) {
						let x = states[i][j]
						newParents.push( states[i] )
						newStates.push(x)
					}
				}
				parents = newParents
				states = newStates
				break inner;
			} else if ( nextOp instanceof Filter ) {
				let [ready, deps] = nextOp.ready()

				if (!ready) return { updated: false }

				for( let i = 0; i < states.length; i++ ) {
					let match = nextOp.visitor(states[i], ...deps)
					if( !match ) {
						states[i] = undefined
						parents[i] = undefined
					}
				}

				states = states.filter( x => typeof x != 'undefined' )
				parents = parents.filter( x => typeof x != 'undefined')

				break inner;
			} else {
				throw 'lol?'
			}
			if( nextOp.isStatic ) staticRemaining--
		}


		// exited early
		if( stack.length ) return { updated: false };

		let anyChange = false
		let outputStates = []
		// final write
		if ( finalOp ) {

			if( finalOp instanceof Root ) {
				for( let i = 0; i < states.length; i++ ) {
					visitor(states[i])
				}
			} else if ( finalOp instanceof Property ) {
				for( let i = 0; i < states.length; i++ ) {
					let plz = visitor(states[i][finalOp.key])
					if( plz != states[i][finalOp.key] ) {
						let editingReal = 
							transactionDetected 
							&& states[i].__proto__ == Object.prototype
						if( transactionDetected && editingReal) {
							states[i] = Object.create(states[i])
						}

						states[i][finalOp.key] = plz
						anyChange = true
						outputStates.push(plz)
					}
				}
			} else if ( finalOp instanceof Transform ) {
				return { updated: false };
			} else if ( finalOp instanceof Traverse ) {
				for( let i = 0; i < parents.length; i++ ){
					let j = parents[i].indexOf( states[i] )
					let plz = visitor(parents[i][j])
					if (plz != parents[i][j]) {
						parents[i][j] = plz
						anyChange = true
						outputStates.push(plz)
					}
				}			
			} else if ( finalOp instanceof Filter ) {
				let [ready, deps] = finalOp.ready()
				if(!ready) return { updated: false };

				for( let i = 0; i < parents.length; i++ ){
	
					let match = finalOp.visitor(states[i], ...deps)
					if( !match ) continue;
					
					let j = parents[i].indexOf( states[i] )
					let plz = visitor(parents[i][j])
					if(plz != parents[i][j] ) {
						parents[i][j] = plz
						anyChange = true
						outputStates.push(plz)
					}
				}
			}

			return { updated: anyChange, states: outputStates }
		}

		return { updated: false }
	}
	
	get({ states }){
		if (this.parts.length == 0){
			return states
		}

		let stack = this.parts.slice(0, -1)
		let nextOp;
		let finalOp = this.parts.slice(-1)[0]
		states = states.slice()
		let staticRemaining = this.staticParts.length

		// skip the setup
		if ( this.parts.length == 1 ) stack = []
		
		outer: while ( nextOp = stack.shift() ) {
			
			inner: 

				if( nextOp instanceof Root) {
					// no-op	
				} else if ( nextOp instanceof Property ) {
					for( let i = 0; i < states.length; i++ ) {
						if( typeof states[i][nextOp.key] == 'undefined' && staticRemaining > 0 ) {
							states[i][nextOp.key] = {}
						}
						// focus on a new state
						states[i] = states[i][nextOp.key]
					}
				} else if ( nextOp instanceof Transform ) {
					let [ready, deps] = nextOp.ready()

					if (!ready) break outer;
					for( let i = 0; i < states.length; i++ ) {
						states[i] = nextOp.visitor(states[i], ...deps)
					}

				} else if ( nextOp instanceof Traverse ) {
					states = states.flatMap( x => x )
				} else if ( nextOp instanceof Filter ) {
					let [ready, deps] = nextOp.ready()

					if (!ready) break outer;

					for( let i = 0; i < states.length; i++ ) {
						let match = nextOp.visitor(states[i], ...deps)
						if( !match ) states[i] = undefined
					}
					
				} else {
					throw 'lol?'
				}
			
			// todo-james one pass
			if( nextOp instanceof Filter ) {
				states = states.filter( x => typeof x != 'undefined' )
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
				let [ready, deps] = finalOp.ready()

				if (!ready) {
					states = []; break chain;
				}

				for( let i = 0; i < states.length; i++ ) {
					states[i] = finalOp.visitor(states[i], ...deps)
				}
			} else if ( finalOp instanceof Traverse ) {
				states = states.flatMap( x => x )
			} else if ( finalOp instanceof Filter ) {
				let [ready, deps] = finalOp.ready()

				if (!ready) {
					states = []; break chain;
				}

				let newStates = []
				for( let i = 0; i < states.length; i++ ) {
					let match = finalOp.visitor(states[i], ...deps)
					if( !match ) continue;
					newStates.push(states[i])
				}
				states = newStates
			}

			return states
		}

		return []
	}
	remove({ states }){
		let stack = this.parts.slice(0, -1)
		let nextOp;
		let finalOp = this.parts.slice(-1)[0]
		states = states.slice()

		// we keep this parents list in sync
		// with states
		// so that as states shrinks/expands
		// the ith state's parent can be found
		// in parents[i]
		// this means we don't need to limit
		// how many transforms occur to the states
		// list.
		// previous attempts included a Map
		// of state => parent
		// but that doesn't account for primative
		// values, whereas this does.
		// 
		// the initial parents index is undefined because
		// the root has no parent
		let parents = []
		let lastPropertyKey;

		// skip the setup
		if ( this.parts.length == 1 ) stack = []
		
		outer: while ( nextOp = stack.shift() ) {
			
			inner: if( nextOp instanceof Root) {
				parents = states.slice()
			} else if ( nextOp instanceof Property ) {
				parents = states.slice()

				for( let i = 0; i < states.length; i++ ) {
					if( typeof states[i][nextOp.key] == 'undefined' ) {
						// we wanted to delete a child path
						// but even the parent path doesn't exist
						// so job done
						return true;
					}

					// focus on a new state
					states[i] = states[i][nextOp.key]
					// so we can do delete parents[i][lastPropertyKey]
					// if parents[i] is not a list
					lastPropertyKey = nextOp.key
				}

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
				let newParents = []
				for( let i = 0; i < states.length; i++){
					// eslint-disable-next-line max-depth
					for( let j = 0; j < states[i].length; j++ ) {
						let x = states[i][j]
						newParents.push( states[i] )
						newStates.push(x)
					}
				}
				parents = newParents
				states = newStates
			} else if ( nextOp instanceof Filter ) {
				let [ready, deps] = nextOp.ready()

				if (!ready) break outer;

				for( let i = 0; i < states.length; i++ ) {
					let match = nextOp.visitor(states[i], ...deps)
					if( !match ) {
						states[i] = undefined
						parents[i] = undefined
					}
				}

				// todo-james splice in one pass above
				states = states.filter( x => typeof x != 'undefined' )
				parents = parents.filter( x => typeof x != 'undefined')

			} else {
				throw 'lol?'
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
				if( parents.length ) {
					let parentRef = new Set()
	
					for( let i = 0; i < parents.length; i++ ){
	
						if (Array.isArray(parents[i])){
							let j = parents[i].indexOf( states[i] )
							parents[i][j] = undefined
						
							parentRef.set( parents[i] )
						} else if(lastPropertyKey) {
							parents[i][lastPropertyKey].length = 0
						} else {
							throw 'lol?'
						}
					}
	
					// todo-james could move this into a single pass 
					// above via a Map<parent, offset>
					for( let parent of parentRef ) {
						let offset = 0
						for (let i = 0; i< parent.slice().length; i++){
							if( typeof parent[i] == 'undefined' ) {
								parent.splice(i-offset, 1)
								offset++
							}
						}
					}
				} else {
					for( let state of states ) {
						state.length = 0
					}
				}
			} else if ( finalOp instanceof Filter ) {
				let [ready, deps] = finalOp.ready()

				if( !ready ) {
					return false
				}

				if( parents.length > 0 ) {

					let parentOffset = new Map()
	
					for( let i = 0; i < parents.length; i++ ){
	
						let match = finalOp.visitor(states[i], ...deps)
						if( !match ) continue;
						if( Array.isArray(parents[i]) ) {
							if(!parentOffset.has( parents[i] )){
								parentOffset.set(parents[i], 0)
							}
							let offset = parentOffset.get(parents[i])
							let j = parents[i].indexOf( states[i] )
							parents[i].splice(j-offset, 1)
							offset++
							parentOffset.set(parents[i], offset)
						} else if (lastPropertyKey) {
							// e.g. deleting a filter with no $values
							// means, only action this property delete
							// if the predicate passes
							// z.state.someFlag.$filter(somePredicate).$delete()
							delete parents[i][lastPropertyKey]
						} else {
							throw 'lol?'
						}
					}

				} else {
					let offset = 0;
					for( let i = 0; i < states.slice().length; i++ ) {

						let match = finalOp.visitor(states[i], ...deps)

						if( match ) {
							states.splice(i-offset, 1)
							offset++
						}
					}
				}
			}
			return true
		}
		return false
	}
}

export function addParts(path, ...parts){
	if( path.parts.length == 0 && path.parts[0] instanceof Root ) {
		return Path.of(parts)
	}
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
	
	constructor(){
		super()
	}
}

/**
 * This class represents dot chaining into
 * properties.
 */
export class Property extends Op {
	rank = 1
	isStatic = true
	constructor(key){
		super()
		this.key = key
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
	
	constructor(visitor, dependencies=[], theirKey=visitor.toString() ){
		super()
		this.visitor = visitor
		this.key = `$map(${theirKey}, [${dependencies.map( x => x.$path.key ).join(',')}])`
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
		visitor, dependencies=[], theirKey=visitor.toString() 
	){
		super()
		this.visitor = visitor
		this.key = `$filter(${theirKey}, [${dependencies.map( x => x.$path.key ).join(',')}])`
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
	constructor(){
		super()
	}
}