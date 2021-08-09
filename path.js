export class Path {
	__parts=[]
	__key=this.__parts.join('.')
	constructor(xs=[]){
		if( typeof xs == 'string' ) xs = xs.split('.').map( x => new Property(x) )
		
		this.parts = xs
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
    toString(){
        return this.key
    }
}
export class Property extends PathOperations {
    rank = 1
    constructor(key){
        super()
        this.key = key
    }
}
export class Transform extends PathOperations {
    rank = 2
    constructor(visitor, key=visitor.toString()){
        super()
        this.visitor = visitor
        this.key = key
    }
}
export class Filter extends PathOperations {
    rank = 2
    constructor(visitor, key=visitor.toString()){
        super()
        this.visitor = visitor
        this.key = key
    }
}
export class Traverse extends PathOperations {
    rank = 4
    rank = 2
    constructor(key='.$values'){
        super()
        this.key = key
    }
}