Z4
==

> 🚨 This is the 4th rewrite of a library I am already using in production.  The previous iteration was immutable and highly optimized but was also very complicated.  This is an attempt to write Z with fresh eyes with everything I've learned in the past 3 iterations.  The goal is to beat the performance of Z3 but have a simple/obvious code base that doesn't require a ton of effort to understand what is going on.
>
> Needless to say, the API is super in flux, the documentation is incorrect and out of date, and you should not use this in any project yet.
>
> To see the current state of the project checkout https://github.com/JAForbes/z4/projects/1

What is it?
-----------

Z4 is the next generation of functional UI reactive state.  It takes lessons from streams, lenses and atoms but is ultimately something new.

The biggest difference between Z4 and other approaches is that Z4 behaves a lot more like a client side reactive database that was designed specifically for managing UI state.

In Z4 you query for state that may or may not exist, and these queries can be subscribed and written back to.  When you write to a query the state doesn't live inside the query, it lives in the state tree itself or within various centralized managed caches.

Because Z4 is centrally managed, many optimizations can be introduced that are impossible with streams and lenses.  Z4 knows exactly what caches need to be updated, and in what order.  It can often skip or defer work as it knows who and what is accessing the state.  It can perform actions on write, on read and on propagation instead of performing them immediately.

The debugging experience is improved by the fact all queries have a named position in the tree defined by the way the query was defined.

E.g. if you are accessing `user.user_name` the query is called `"user.user_name"`.  

Additionally Z4 manages the internal state, so it takes this opportunity to safely use mutation.  This leads to performance in improvements as all static query values are always in sync with the tree as they have a lazy reference to a mutable state tree.

Subscriptions are a place to listen to changes in queries and perform side effects.  This is where your application code can perform network requests or effects.  Subscriptions are always called after the tree has fully propagated.  Any writes to the tree are deferred by default until the subscription exits, except if the subscription `yield`'s control back to `Z4` via a generator function.

Z4 is in a word controlled.  Other solutions are elegant in their implementation but not in their runtime debugging experience.  Z4 is the largely the opposite.  The source code is filled with if statements, multiple caches, many duplicated entry points (to avoid call stacks) and so on.  But this is all to improve performance and runtime clarity.

How does it work?
-----------------

```js
const { state } = Z()

// This is a query
const c = state.a.b.c

// I can write to it
c('hello')

// And the change is reflected elsewhere in the tree
b()
{ c: 'hello' }

// I can subscribe to changes
c.$on( value => console.log('hello', value) )

// I can also transform it
let C = b.$map( x => x.toUpperCase() +'!' )
```

Queries
-------

Z4 was designed to solve a common problem in web based applications, 100% navigable state transitions.  E.g. you should be able to define the relationships between state using identifiers and relationships before the data arrives.  And as the data arrives, or changes the queries should propagate.

This allows you to define user interfaces in terms of route state.  If the id in a route changes, the queries are automatically targeting the correct subset of data.  And if the data hasn't arrived yet, services can automatically fetch it.

This means transitioning between different routes requires no special code to reset the state, or initialize the state.  Instead we define that code as a simple response to a set of relationships.

In the following example we define that the `sshKey` is a join on the `sshKey.id` and the `route.value.id` and that the current `section` of the url must be `ssh-keys`.

We define this before any ssh key data has been set.  The moment the data changes, the other queries respond.  And those query dependencies, and their dynamic relationships are all read/write and subscribable.


```js
z.state.route = parseURL('/settings/security/ssh-keys/4')

z.state.route()
// { tag: 'Settings', value: { page: 'security', section: 'ssh-keys', id: 4 } }

let section = z.state.route.value.section
let page = z.state.route.value.page
let id = z.state.route.value.id

let sshKey = 
    z.state.sshKeys
        .$filter(([section]) => section == 'ssh-keys' )
        .$filter([id, section], x => id() == x.id )

let name = sshKey.name
let value = sshKey.value


z.state.sshKeys([
    { id:1, name: 'Home' },
    { id:2, name: 'Work' },
    { id:3, name: 'Laptop' },
    { id:4, name: 'Raspberry Pi' }
])


name() // 'Raspberry Pi'

id(2)

name() // 'Work'

name('Office')

sshKey() // { id: 2, name: 'Office' }

z.state.sshKeys()
// [
//     { id:1, name: 'Home' },
//     { id:2, name: 'Office' },
//     { id:3, name: 'Laptop' },
//     { id:4, name: 'Raspberry Pi' }
// ]

section('personal-access-token')

name() 
// undefined

name('Work')
// no-op

name()
// undefined

// Our predicate is no longer satisfied
// We get back no results, but we can
// use .$optimistic to return the last
// value before the result set was empty
// or to return the latest value even
// before it is committed

state = z.state.$optimistic
state.name() // 'Work'
```


Notes:

Services
--------

> 🚨 This isn't implemented yet

You can transform a value with a visitor function just like `stream.map` in other libraries.  In Z4 these transforms are logical and may not run when you expect them too.  So it is important not to rely on them for unrelated side effects like logging, or network requests.

Often in Z4 computations are deferred until they are read, or until there is some idle time that can be used. So placing a log in a call to `.$map`, `.$filter` etc may not run when you expect it too.

If you want to perform some action beyond querying or writing to the tree, you can do so in a a service.

Services are different to queries, they receive values from the tree, they can be paused and resumed, but they are not queries, they do not return a value that can be transformed, they are leaf nodes in the Z4 propagation tree.

Services are defined as synchronous or generator functions.  Generator functions allow you to pause the side effect while async services run, or while the state tree propagates.  This pausing solves a common problem in reactive state solutions: infinite loops when writing back to tree in response to a subscription.

Any writes you perform for the duration of a service do not actually get applied to the state tree until the generator exits.  This is very similar to database transactions.  

> 💡 If you want the view to see writes before they are committed you can use `.$optimistic` on any query.

You can pass an options object to a side effect to change the service behaviour:

- `throttle` will run the service at most the specified amount of milliseconds
- `debounce` will delay running the service by the specified amount of milliseconds every time the value changes
- `cancel` will cancel resuming the effect if one of the subscription inputs updates while the effect is running (`finally` blocks will still run)

```js
z([z.state.a.b.c], function * effect(){

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
    .then( x => x.json() )

    // We can write back to the tree
    // but out side of this service
    // state.data will still be the
    // old value
    this.data = response

    // we can still write to the global state
    // by using `z.state` instead of
    // this

}, { throttle: 500, cancel: false })
```

If you do not like `this`, you can also use the query instance that is passed in as the only argument to the query context:

```js
z([z.state.a.b.c], function * (state){

  // equivalent
  state.data = 'hello'
  this.data = 'hello'

})
```

Few things to note from this sample.  

- Setting a query value to what it already is, is a no-op.  So there is no need to check that the existing value does not already equal the value you are setting it to.
- `z.fetch` is just `fetch` but will automatically cancel network requests when a service is cancelled and can be replaced with alternative implementations for testing or for supporting older environments.  You can use native fetch if you want, or any other promise returning function, but you will need to handle cancellation yourself.

- No arguments are passed to the side effect generator except a draft state query.

This side effect will run when values change, or after side effects are resolved, but to access the current value of the query, you still access it from the state tree itself.

This ensures the value you have is always the latest value.  It is not recommended to destructure the state as it is easy to forget that after a yield the value may be stale.  A qualified access will never be stale.

This doesn't mean you need to fully qualify access, this is completely fine for example:

```js
z([state.a.b.c], function * effect(){
    let { c } = state.a.b

    c()
    yield
    c(c() + 2)
    yield
    c()

})
```

Whereas this is not:


```js
z([state.a.b.c], function * effect(){
    let c = state.a.b.c()

    c // not stale yet
    yield
    let next = c + 1 // c is potentially stale
    state.a.b.c(next) 
    yield
    c // c is stale

})
```

The list of dependencies is required but if other queries are read within the lifetime of a service an implicit dependency is assumed so that in future if that implicit value propagates this effect will run. Note this isn't the case when writing to a query.

This is completely fine as long as you are ok with the first run of this service not reacting to those implicit dependencies.  Note, a service with no dependencies will never run.

A service will not run if the explicit dependencies have undefined values.  This can be one reason to have explicit and implicit dependencies, when some values are required to be defined, and others are not required to be defined, e.g. in loading services.

Promises
--------

> 🚨 Not implemented yet

Setting a query value to a promise will schedule a write to the tree if the promise resolves.  But it is recommended to keep all side effects in services.

Mutation
--------

Z4 assumes it is the sole entity directly reading and writing from the state.  As a result, Z4 assumes it can mutate the state tree directly.  This may seem heretical given Z4 claims to be functional and takes inspiration from streams & lenses - but let's take a step back.  Why is mutation ever a problem?  If it is so much faster, why would we avoid it?

Usually, we avoid mutation because it can lead to bugs where some component in a large app is modifying the state in an unpredictable or unwanted way, but it is impossible to trace where the change is coming from, and therefore difficult to resolve the bug.  As all entities in the app have direct access to the same state tree there is no safe guards, tracking, or preventative measures.

With Z4, reads and writes all occur through a proxy.  There are no untracked mutations.  This can be guaranteed in development via `Object.freeze` whenever a non primative value is accessed from a query, but it also so convenient to use Z4 correctly that breaking the rules is more awkward than using it properly.

Because Z4 mutates, there is no need to propagate the value of most queries, as they are just lazily accessing the state tree at a given path.  Any dynamic queries are computed on read only if their dependencies reference equality has changed.  This makes the entire system optimized for writes as writing doesn't trigger any state updates.  And because we rely on reference equality when computing dynamic queries we are also optimized for read.

When a state change occurs, Z4 will notify relevant subscriptions, but that is almost all it needs to do.