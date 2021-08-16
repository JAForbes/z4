import * as Path from './path.js'
import { Handler, Lifecycle } from './proxy.js'
import Z4 from './z.js'

class Mutation {
	handler = new Handler(new Path, new Lifecycle(), () => [], new Map())
	states = []
	constructor(handler, states){
		this.handler = handler
		this.states = states
	}
	static Set = class Set extends Mutation {
		constructor(handler, states, visitor){
			super(handler, states)
			this.visitor = visitor
		}
	}
	static Remove = class Delete extends Mutation {}
}

export default class Transaction extends Z4 {

	static State = class State {
		static Pending = class Pending extends State {}
		static Aborted = class Aborted extends State {}
		static Committed = class Committed extends State {}
	}

	constructor(zz, visitor=async function(){}){
		super()


		this.parent = zz
		this.path = Path.of()

		this.visitor = visitor

		this.states = zz.root.$all().map( x => Object.create(x) )

		this.root = Proxy.PathProxy.of(
			this.path
			, this
			, () => this.states
			, this.proxyCache
		)

		this.mutations = new Map()
		this.state = new Transaction.state.Pending()
	}

	async run(){
		await this.visitor(this.root)
		this.replayMutations()
	}

	onset(handler, states, visitor){
		this.cachedValues.clear()
		
		let key = handler.path.key
		this.cachedValues.set(key, states)

		this.mutations.set(key, new Mutation.Set(handler, states, visitor))
	}

	onremove(handler){
		this.cachedSubscriptions = {}
		this.cachedValues.clear()
		let key = handler.path.key
		
		this.mutations.set(key, new Mutation.Remove(handler))
	}

	replayMutations(){
		let states = this.parent.$$all() 
		for( let mutation of Object.values(this.mutations) ) {
			
			if( mutation instanceof Mutation.Set ) {
				let response = mutation.path.set({ 
					visitor: mutation.visitor, states
				})

				if( !response.updated ) {
					throw new Error('Commit failed, state only partially resolved.')
				}

				this.parent.onset(this.handler, response.states)
				
			} else if ( mutation instanceof Mutation.Remove ) {
				let worked = mutation.path.remove({ 
					states
				})

				if(!worked) {
					throw new Error('Commit failed, state only partially resolved.')
				}

				this.parent.onremove()
			}
		}
	}
}