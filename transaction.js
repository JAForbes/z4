import * as Path from './path.js'
import * as Proxy from './proxy.js'
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

	static state = class State {
		static Pending = class Pending extends State {}
		static Running = class Running extends State {}
		static Rollback = class Rollback extends State {}
		static Aborted = class Aborted extends State {}
		static Replaying = class Running extends State {}
		static Committed = class Committed extends State {}
	}

	constructor(zz=new Z4(), visitor=async function(){}){
		super()


		this.parent = zz
		this.path = Path.Path.of()
		this._state = new Transaction.state.Pending()
		this.visitor = visitor

		this.states = zz.state.$$all().map( x => Object.create(x) )

		this.root = Proxy.PathProxy.of(
			this.path
			, this
			, () => this.states
			, this.proxyCache
		)

		this.mutations = new Map()
		this._state = new Transaction.state.Pending()
	}

	async run(){
		if ( this._state instanceof Transaction.state.Pending ) {
			try {
				this._state = new Transaction.state.Running()

				await this.invokeVisitor( () => this.visitor(this.root) )

				this._state = new Transaction.state.Replaying()
				await this.replayMutations()
				this._state = new Transaction.state.Committed()
			} catch (e) {
				this._state = new Transaction.state.Aborted(e)
				throw e
			}
		}
		
	}


	invokeVisitor(visitor){
		let it = visitor()
	
		// expose so it can be cancelled externally
		this.iterator = it

		async function interpret(any){
	
			try {
				if ( any.value instanceof Promise ) {
					return any.value
						.then( x => interpret(it.next(x)), e => interpret(it.throw(e)) )
				} else if ( !any.done ) {
					return interpret(it.next(any.value))
				}
			} catch (e) {
				console.error(e)
			}
		}

	
		return interpret(it.next())
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

	/**
	 * Writes all mutations that occured in the transaction
	 * back to the main state tree.
	 * 
	 * But we tell the parent instance to not notify yet.
	 * Because we want the entire set of writes to resolve
	 * before yet another transaction starts that will trigger
	 * the same writes and we never get to a point where
	 * the full changeset resolves.
	 */
	async replayMutations(){
		let states = this.parent.state.$$all() 
		let notifications = []
		for( let mutation of Object.values(this.mutations) ) {
			
			if( mutation instanceof Mutation.Set ) {
				let response = mutation.path.set({ 
					visitor: mutation.visitor, states
				})

				if( !response.updated ) {
					throw new Error('Commit failed, state only partially resolved.')
				}
				notifications.push({ mutation, states: response.states })
		
			} else if ( mutation instanceof Mutation.Remove ) {
				let worked = mutation.path.remove({ 
					states
				})

				if(!worked) {
					throw new Error('Commit failed, state only partially resolved.')
				}

				notifications.push({ mutation })
			}
		}

		this.parent.cachedValues.clear()

		let subs = new Set()
		for( let notification of notifications ) {
			let key = notification.mutation.handler.path.key
			for( let sub of this.parent.notifications(key) ){
				subs.add(sub)
			}
		}

		for( let sub of subs ) {
			// this is where a new transaction should
			// be created and injected
			let t = new Transaction(this.parent, ctx => sub.visitor(ctx))
			await t.run()
		}

	}
}