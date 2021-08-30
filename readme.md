<h1 align="center">Zed</h1>

<p align="center">
    <img width="300" align="center" src="z.svg" />
</p>

What is it?
-----------


> 🚨 This is the 4th rewrite of a library I am already using in production.  The previous iteration was immutable and highly optimized but was also very complicated.  This is an attempt to write Z with fresh eyes with everything I've learned in the past 3 iterations.  The goal is to beat the performance of Z3 but have a simple/obvious code base that doesn't require a ton of effort to understand what is going on.
>
> Needless to say, the API is super in flux, the documentation is incorrect and out of date, and you should not use this in any project yet.
>
> The only reason this package is semver major is due to the name being transferred over.  Despite the semver major version you should consider this alpha software.
>

Zed is the next generation of functional UI reactive state.  It takes lessons from streams, lenses and atoms but is ultimately something new.

The biggest difference between Zed and other approaches is that Zed behaves a lot more like a client side reactive database that was designed specifically for managing UI state and effects.

How does it work?
-----------------

```js
const { state } = new Z()

// This is a query
let currentUser = 
    state.users
        .$values
        .$filter( 
            (x, route) => x.id == route.user_id
            , [state.route]
        )

// only writes to the shared tree
// when the function exits cleanly
z.transaction([currentUser], function * (){
    // z.fetch is optional
    // it just auto cancels requests for you
    // if the transaction throws
    let { metadata } = yield z.fetch('/api/users/' + currentUser.id)

    currentUser.metadata = metadata
})

state.route.id  = 2

state.users = [{ id: 1, name: 'Joe' }, { id: 2, name: 'James' }]

currentUser.name()
// 'James'

🐰🎩
currentUser.name = 'Barney'

state.users()
[{ id: 1, name: 'Joe' }, { id: 2, name: 'Barney' }]


```

Queries
-------

Zed was designed to solve a common problem in web based applications, 100% navigable state transitions.  E.g. you should be able to define the relationships between state using identifiers and relationships before the data arrives.  And as the data arrives, or changes the queries should propagate.

This allows you to define user interfaces in terms of route state.  If the id in a route changes, the queries are automatically targeting the correct subset of data.  And if the data hasn't arrived yet, services can automatically fetch it.

This means transitioning between different routes requires no special code to reset the state, or initialize the state.  Instead we define that code as a simple response to a set of relationships.


Documentation
-------------

- [Guide](./guide.md)
- [API](./api.md)

- [Best Practices](./best-practices.md)
- [Middleware](./middleware.md)
- [Terminology](./terminology.md)

Services
--------

You can transform a value with a visitor function just like `stream.map` in other libraries.  In Zed these transforms are logical and may not run when you expect them too.  So it is important not to rely on them for unrelated side effects like logging, or network requests.

Often in Zed computations are deferred until they are read, or until there is some idle time that can be used. So placing a log in a call to `.$map`, `.$filter` etc may not run when you expect it too.

If you want to perform some action beyond querying or writing to the tree, you can do so in a a service.

Services are different to queries, they receive values from the tree, they can be paused and resumed, but they are not queries, they do not return a value that can be transformed, they are leaf nodes in the Zed propagation tree.

Services are defined as synchronous or generator functions.  Generator functions allow you to pause the side effect while async services run, or while the state tree propagates.  This pausing solves a common problem in reactive state solutions: infinite loops when writing back to tree in response to a subscription.

Any writes you perform for the duration of a service do not actually get applied to the state tree until the generator exits.  This is very similar to database transactions.  

```js
z.service([z.state.a.b.c], function * effect(z){

    // Run a network request
    // the service pauses while
    // until the request resolves
    let response = yield z.fetch(
        '/api/data'
        , 
        { method: 'POST'
        , body: JSON.stringify(this.a.b.c()) 
        }
    )
    response = yield response.json()

    // We can write back to the tree
    // but out side of this service
    // state.data will still be the
    // old value
    z.data = response

})
```

We use generators instead of async/await because generator execution can be cancelled externally.  This allows Zed and the user to configure what should happen when the same transaction is initiated twice via two different events concurrently.

The default behavior would be to abort the existing transaction and start the new one, but there are other desired behaviors such as allowing the existing transaction to complete and throttling new instantiations of the same service by a desired threshold.  It depends if you want the latest value, any value, or all values.

But Zed will not allow two transactions belonging to the same service to run at the same time.

```js
z.service([z.state.a.b.c], function * (z){

    z.state.loading = true

    // Run a network request
    // if it throws, any state changes within
    // this transaction will be automatically
    // rolled back
    let response = yield z.fetch(
        '/api/data'
        , 
        { method: 'POST'
        , body: JSON.stringify(z.state.a.b.c()) 
        }
    )

    response = yield response.json()

    // We can write back to the tree
    // but outside of this service
    // state.data will still be the
    // old value
    z.state.data = response

})
```

Few things to note from this sample.  

- Setting a query value to what it already is, is a no-op.  So there is no need to check that the existing value does not already equal the value you are setting it to.
- `z.fetch` is like `fetch` but will automatically cancel network requests when a service is cancelled and can be replaced with alternative implementations for testing or for supporting older environments.  Additionally it doesn't execute when you invoke it, but when it is yielded.  It also does not return a promise so `.then` chaining will not work.  You can use native fetch if you want, or any other promise returning function, but you will need to handle cancellation yourself.
- You can easily add your own effects to Z's transaction interpreter.  Simply yield a value that your own middleware can handle.  See [middleware](./middleware.md)


Promises
--------

> 🚨 Not implemented yet

Setting a query value to a promise will schedule a write to the tree if the promise resolves.  But it is recommended to keep all side effects in services.

Mutation
--------

Zed assumes it is the sole entity directly reading and writing from the state.  As a result, Zed assumes it can mutate the state tree directly.  This may seem heretical given Zed claims to be functional and takes inspiration from streams & lenses - but let's take a step back.  Why is mutation ever a problem?  If it is so much faster, why would we avoid it?

Usually, we avoid mutation because it can lead to bugs where some component in a large app is modifying the state in an unpredictable or unwanted way, but it is impossible to trace where the change is coming from, and therefore difficult to resolve the bug.  As all entities in the app have direct access to the same state tree there is no safe guards, tracking, or preventative measures.

With Zed, reads and writes all occur through a proxy.  There are no untracked mutations.  This can be guaranteed in development via `Object.freeze` whenever a non primative value is accessed from a query, but it also so convenient to use Zed correctly that breaking the rules is more awkward than using it properly.

Because Zed mutates, there is no need to propagate the value of most queries, as they are just lazily accessing the state tree at a given path.  Any dynamic queries are computed on read only if their dependencies reference equality has changed.  This makes the entire system optimized for writes as writing doesn't trigger any state updates.  And because we rely on reference equality when computing dynamic queries we are also optimized for read.

When a state change occurs, Zed will notify relevant subscriptions, but that is almost all it needs to do.
