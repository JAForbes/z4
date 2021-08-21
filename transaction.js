import * as Path from './path.js'
import * as Proxy from './proxy.js'

class CancellationError extends Error {}

class Mutation {
	handler = new Proxy.Handler(
		Path.Path.of(), new Proxy.Lifecycle(), () => [], new Map()
	)
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

export default class Transaction {

	static state = class State {
		static Pending = class Pending extends State {}
		static Running = class Running extends State {}
		static Rollback = class Rollback extends State {}
		static Aborted = class Aborted extends State {}
		static Replaying = class Running extends State {}
		static Committed = class Committed extends State {}
	}

	constructor(zz=new Z4(), visitor=async function(){}){

		this.z = new Z4(zz.state.$$all().map( x => Object.create(x) )[0])

		this.parent = zz
		this.path = Path.Path.of()
		this._state = new Transaction.state.Pending()
		this.visitor = visitor
		this.mutations = new Map()
		this._state = new Transaction.state.Pending()

		let mutations = this.mutations

		Object.assign(this.z, {
			onset(handler, states, visitor){
				this.cachedValues.clear()
				
				let key = handler.path.key
				this.cachedValues.set(key, states)
		
				mutations.set(key, new Mutation.Set(handler, states, visitor))
			},
		
			onremove(handler){
				this.cachedSubscriptions = {}
				this.cachedValues.clear()
				let key = handler.path.key
				
				mutations.set(key, new Mutation.Remove(handler))
			}
	
		})
	}

	async _run(){
		if ( this._state instanceof Transaction.state.Pending ) {
			try {
				this._state = new Transaction.state.Running()

				await this.invokeVisitor( () => this.visitor(this.z) )

				this._state = new Transaction.state.Replaying()
				await this.replayMutations()
				this._state = new Transaction.state.Committed()
			} catch (e) {
				this._state = new Transaction.state.Rollback(e)
				// throw e
			}
		}
	}

	async run(){
		if ( this._state instanceof Transaction.state.Pending ) {
			this.promise = this._run()
		}
	}

	invokeVisitor(visitor){
		let it = visitor()
	
		// expose so it can be cancelled externally
		this.iterator = it

		async function interpret(any){
			if ( any.value instanceof Promise ) {
				return any.value
					.then( x => interpret(it.next(x)), e => {
						throw interpret(it.throw(e))
					})
			} else if ( !any.done ) {
				return interpret(it.next(any.value))
			} else {
				it.return()
				return null;
			}
		}

		return interpret(it.next())
	}

	cancel(){
		if( this._state instanceof Transaction.state.Running ) {
			try {
				this.iterator.throw( new CancellationError() )
			} catch(e) {}
		}
	}

	get ended(){
		return (
			this._state instanceof Transaction.state.Committed
			|| this._state instanceof Transaction.state.Rollback
		)
	}

	get pending(){
		return (
			this._state instanceof Transaction.state.Pending
		)
	}

	get running(){
		return (
			this._state instanceof Transaction.state.Running
		)
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
		for( let mutation of this.mutations.values() ) {
			
			if( mutation instanceof Mutation.Set ) {
				let response = mutation.handler.path.set({ 
					visitor: mutation.visitor, states
				})

				if( !response.updated ) {
					throw new Error('Commit failed, state only partially resolved.')
				}
				notifications.push({ mutation, states: response.states })
		
			} else if ( mutation instanceof Mutation.Remove ) {
				let worked = mutation.handler.path.remove({ 
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
			await t.run().catch( () => {})
		}

	}
}