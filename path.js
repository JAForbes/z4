const paths = {}

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

export class PathOperations { 
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

export class Property extends PathOperations {
	rank = 1
	isStatic = true
	constructor(meta, key){
		super()
		this.key = key
		this.meta = meta
	}

	get state(){
		return this.meta.state[this.key]
	}

	set({ value }){
		this.meta.state[this.key] = value
	}
	get(){
		return [this.meta.state[this.key]]
	}
	remove(){
		return delete this.meta.state[this.key]
	}
}

export class Transform extends PathOperations {
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
		return this.meta.state.map( state => this.visitor(state, deps) )
	}

	// cannot delete a map, makes no sense
	remove({}){
		return false
	}
}

export class Filter extends PathOperations {
	rank = 3
	isStatic = false
	constructor(meta, visitor, dependencies=[], theirKey=visitor.toString() ){
		super()
		this.visitor = visitor
		this.key = `$filter(${theirKey}, [${dependencies.map( x => x.$.path.key ).join(',')}])`
		this.meta = meta
		this.dependencies = dependencies
	}

	set({ value }){
		let deps = this.dependencies.map( x => x() )
		let state = this.meta.state
		for( let i = 0; i < state.length; i++ ) {
			let x = state[i]
			let match = this.visitor( x, deps)
			if ( match ) {
				state[i] = value
			}
		} 
	}
	
	get(){
		let deps = this.dependencies.map( x => x() )
		return this.meta.state.filter( x => this.visitor(x, deps) )
	}

	remove(){
		let deps = this.dependencies.map( x => x() )
		let state = this.meta.state
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
	isStatic = false
	key="$values"
	constructor(meta){
		super()
		this.meta = meta
	}

	set({ value }){
		let state = this.meta.state
		for( let i = 0; i < state.length; i++ ) {
			state[i] = value
		} 
	}
	
	get(){
		return this.meta.state
	}

	// deleting values sort of makes sense
	// it means empty the list
	remove(){
		this.meta.state.length = 0
		return true
	}
}