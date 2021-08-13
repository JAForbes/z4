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

	set(){ return true }
	get(){
		return this.meta.state
	}
	remove(){ return true }
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

	set({ value }){
		for(let x of this.meta.state){
			x[this.key] = value
		}
	}
	get(){
		return this.meta.state.map( x => x[this.key])
	}
	remove(){
		for( let x of this.parentMeta.state ) {
			delete x[this.key]
		}
		return true
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

	// cannot set a map, would need to be an iso, maybe later?
	set(){
		return this.meta.state
	}
	
	get(){
		let deps = this.dependencies.map( x => x() )
		return this.meta.state.map( 
			state => this.visitor(state, deps)
		)
	}

	// cannot delete a map, makes no sense
	remove({}){
		return false
	}
}

/**
 * Like a where clause in SQL, in Z we can filter a result set.
 * 
 * This doesn't mean we're filtering a list in your state, it
 * can reduce the result set for any query.
 * 
 * In order to filter an actual list of object in your tree
 * you must use the `Traverse` Op
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

	set({ value }){
		let deps = this.dependencies.map( x => x() )
		/// result set
		for( let o of this.meta.state ) {
			// list or object iteration
			for(let[k,v] of Object.entries(o)){
				let match = this.visitor(v, deps)
				if ( match ) {
					o[k] = value
				}
			}
		}
	}
	
	get(){
		let deps = this.dependencies.map( x => x() )
		return this.meta.state.filter( state => this.visitor(state, deps) )
	}

	remove(){
		let deps = this.dependencies.map( x => x() )
		
		let prev = this.meta.path.prev
		let prevIsTraverse = prev instanceof Traverse

		// For most deletes on a filter we ask the 
		// previous op to action it as we do not
		// know how to delete, filter operates 
		// on result sets, not lists, so it has no
		// clue how to delete e.g. a result set of numbers
		// but if the previous was traverse, it means
		// the list we are filtering is the state itself
		// in that case we need to do the dirty job of 
		// messing with state, for now we only support lists
		// in future we could support 
		// - object "dictionaries"
		// - Maps
		// - Sets
		// ... etc
		if( prevIsTraverse ) {
			// We need the same list as the state tree
			// so we act on the parentMeta state
			// which is the state before .$values does
			// a flatMap
			let states = this.meta.path.prev.meta.state

			for( let state of states ) {
				let len = state.length
				for( let i = 0; i < len; i++ ) {
					if ( i >= state.length ) break;
					let x = state[i]
					let match = this.visitor(x, deps)
					if ( match ) {
						state.splice(1, i)
						i--
					}
				}
			}
		} else {
			for( let state of this.meta.state ) {

				let match = this.visitor(state, deps)
	
				if ( match ) {
					// need to delete, but we don't know how
					// so we ask the previous path op to do it
					// for us
					prev.remove()
				}
			}
		}
		return true
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

	set({ value }){
		for( let state of this.meta.state ) {
			for( let i = 0; i < state.length; i++ ) {
				state[i] = value
			} 
		}
	}
	
	get(){
		// lift each value into the result set
		return this.meta.state.flatMap( x => x )
	}

	// deleting values sort of makes sense
	// it means empty the list
	remove(){
		for( let state of this.meta.state ) {
			state.length = 0
		}
		return true
	}
}