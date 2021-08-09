export class Path {
	__parts=[]
	__key=this.__parts.join('.')
	constructor(xs=[]){
		if( typeof xs == 'string' ) xs = xs.split('.').map( x => new Property(x) )
		
		this.parts = xs
		this.last = xs[xs.length-1]
	}
	get parts() {
		return this.__parts
	}
	set parts(xs){
		this.__parts = xs
		this.__key = xs.join('.')
		return this.__parts
	}
	get key(){
		return this.__key
	}
	concat(xs) {
		if ( xs instanceof Path ) {
			return new Path( this.parts.concat(xs.parts) ) 
		}
		return this.concat(new Path(xs))
	}
}

export class PathOperations { 
	rank = 0 
	key = ''
	dependencies = []
	set(){ throw new Error('Unsupported')}
	get(){ throw new Error('Unsupported')}
	remove(){ throw new Error('Unsupported')}
	toString(){
		return this.key
	}
}
export class Property extends PathOperations {
	rank = 1
	
	constructor(getState, key){
		super()
		this.key = key
		this.getState = getState
	}

	get state(){
		return this.getState()[this.key]
	}

	set({ value }){
		this.getState()[this.key] = value
	}
	get(){
		return [this.getState()[this.key]]
	}
	remove(){
		return delete this.getState()[this.key]
	}
}

export class Transform extends PathOperations {
	rank = 2
	
	constructor(getState, visitor, dependencies=[], theirKey=visitor.toString() ){
		super()
		this.visitor = visitor
		this.getState = getState
		this.key = `$map(${theirKey}, [${dependencies.map( x => x.$.path.key ).join(',')}])`
		this.dependencies = dependencies
	}

	get state(){
		return this.getState()
	}
	// cannot set a map, would need to be an iso, maybe later?
	set(){
		return this.getState()
	}
	
	get(){
		let deps = this.dependencies.map( x => x() )
		return this.getState().map( state => this.visitor(state, deps) )
	}

	// cannot delete a map, makes no sense
	remove({}){
		return false
	}
}

export class Filter extends PathOperations {
	rank = 3
	constructor(getState, visitor, dependencies=[], theirKey=visitor.toString() ){
		super()
		this.visitor = visitor
		this.key = `$filter(${theirKey}, [${dependencies.map( x => x.$.path.key ).join(',')}])`
		this.getState = getState
		this.dependencies = dependencies
	}

	get state(){
		return this.getState()
	}

	set({ value }){
		let deps = this.dependencies.map( x => x() )
		let state = this.getState()
		for( let i = 0; i < state.length; i++ ) {
			let x = state[i]
			let match = this.visitor( x, deps)
			if ( match ) {
				state[i] = x
			}
		} 
	}
	
	get(){
		let deps = this.dependencies.map( x => x() )
		return this.getState().filter( x => this.visitor(x, deps) )
	}

	remove(){
		let deps = this.dependencies.map( x => x() )
		let keep = []
		let removed = 0
		let state = this.getState()
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
		return true
	}
}

export class Traverse extends PathOperations {
	rank = 4
	key="$values"
	constructor(getState){
		super()
		this.getState = getState
	}

	get state(){
		return this.getState()
	}

	set({ value }){
		let state = this.getState()
		for( let i = 0; i < state.length; i++ ) {
			if ( match ) {
				state[i] = value
			}
		} 
	}
	
	get(){
		return this.getState()
	}

	// deleting values sort of makes sense
	// it means empty the list
	remove(){
		this.getState().length = 0
		return true
	}
}