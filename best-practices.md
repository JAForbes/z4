# Best Practices


#### Avoid point free code when using visitor functions in queries

Every query in Z4 has a key.  The key is used to determine identity.  It is important therefore to ensure that no two visitor functions accessing the same dependencies have the same toString as these two queries will be treated as one query.  Because Z4 caches the result of read and write query operations, you could see strange behaviour.

An example would be using a Ramda function in a query.  Because all Ramda functions are wrapped in `R.curry`, all Ramda functions will share the same `Function::toString`.

You can provide a manual `key` as a 3rd argument in all cases a visitor function is accepted.  But it is probably simply clearer to invoke the given function via an arrow function.

A key collision is unlikely, because the entire query path and its dependencies are included in the key.  But the key also acts as a user facing description of the query, it is helpful for diagnostics / debugging and should be human readable.  So even though there are ways around it, it is best to avoid point free code when using Z queries.

Note if the `Function::toString` has been altered, e.g. as with sanctuary-js, this is no longer an issue.

```js
// avoid
z.state.users.$map( R.indexBy(R.prop('id')) )
// .$path.key
// users.$map(function curry(){...}))

// prefer
z.state.users.$map( xs => R.indexBy(R.prop('id'), xs) )

// or prefer
z.state.users.$map( xs => R.indexBy(x => x.id, xs) )

// or prefer
z.state.users.$map( R.indexBy(R.prop('id')), [], 'userIdx' )
```

#### Never access closured queries in a query visitor function

JS closures are fantastic, but Z4 by design avoids implicit dependencies.  If you access a Z4 query from within a visitor function that is not explicitly in the dependency list you may be surprised that your query does not update when the implicit dependency's value changes.

It is ok to access closured variables that are not reactive and considered static for the lifetime of the query, but Z4 works best when you store all state on the state tree and reference dependencies explicitly by passing dependencies into the dependency list.

```js
// avoid
// will only update wher users list changes
// not when route id changes
let user = 
    z.state
        .users
        .$values
        .$filter( x => x.id == z.state.route.id() )

// prefer
// will update when users list and route.id updates
let user =
    z.state
        .users
        .$values
        .$filter( (x,y) => x.id == y, [z.state.route.id()] )
```

#### Keep state shallow

Z is modelled a lot more like a database with tables and table joins than other UI state management systems.  It is a relational state management library.  Because you can easily create joins there is less of a need to nest data for convenience.  We can just create a query that simulates a nest by joining on the particular id(s).

A shallow state tree makes queries easy to write and consume.  Shallow state also makes it far easier for Z4 to optimize caching and execution of queries.

In browser apps we are used to nesting JS objects to provide easy to related data.  But queries solve this problem in a different way and with greater flexibility as the same data can easily by referenced by completely separate queries.

Finally, Z has to do less work the less the data is nested.  Everytime you dive through state with multiple dot chains, Z has to traverse the state tree through lazy state references, and verify parent fields are not undefined and are ready for read/write.

That isn't to say you can't nest your data, you can, and if the situation calls for it, no problem.  But if there was a grain to work with it would be flat data normalized via unique ids.

> 🤓 Why do shallow trees lead to better performance?  Because Z4 can easily know that two distinct parts of the tree are not represented by a particular query that changed.  The moment there is a single dynamic query that is a parent of a leaf node that was written to in the tree, Z4 will have to assume that visitor function could have referenced in child value.

#### Cache proxy references

If you are diving through nested fields continually, you can instead store a reference to the parent.

E.g.

```js
z.state.onboarding.card.form.card_number = '9422'

// Can be replaced with:
let form = z.state.onboarding.card.form

form.card_number = '9422'
```

It is recommended to pass down cached query proxies to child components to ensure they cannot write to (or read from) fields that are out of scope for that component.

This is not just less noise in your code, and a greater separation of concerns, it is also faster at runtime as Z doesn't need to jump through the proxy router several times for each dot chain.

But, each proxy is only ever created once, and each path is only ever created once, so as has been said in other sections, if you want to break this rule, go for it, Z assumes you will.

#### Use native constructs where applicable

Z proxies support all the proxy traps, the iterable interface, coercion and more.  If you want to delete a field, you can use `user.$delete()` but you should prefer `delete z.state.user`.

If you need to loop through a result set, you can use a for loop:

```js
// prefer
for( let user of z.state.users.$values ) {
    
    user.age++ // still a proxy
}

// avoid
for( let user of z.state.users() ) {
    user.age++ // an object, not a proxy
}

// avoid
z.state.users().map( user => { ... })
```

Why? because the moment you leave the query space Z cannot track what you are doing, it cannot guarantee fields are not null, it cannot cache subsequent reads.  It cannot provide introspection in future dev tools that may be built.  Additionally the default getters return the first item from a result set.  But a query may target multiple values.

There are exceptions to this rule.  In a hyperscript view, it makes sense to escape the proxy and map over values to e.g. render a list because the given framework may not know how to unwrap the proxy.  It is also cumbersome to invoke the query after the hyperscript tree in a deeply nested view.

```js
// prefer
z.state.users().map( x => m('li', x.name))

// avoid
z.state.users.$values.$map( 
    x => m('li', x.name)
)() // <- easy to forget
```

Theoretically using queries in the view is a great idea because repeated reads are cached and DOM mutations could be reactive and localized.  But until we have a framework that accepts queries as raw values we will need to leave the query space before rendering.

Additionally when writing to a query while referencing a previous value it is recommend to use the callback style instead of the proxy style as Z is aware of the previous value for each result, not just the first result.

```js
// prefer
state.count( x => x + 1 )

// avoid
state.count( state.count() + 1 )
```

#### Pass queries around, not raw state

Z queries can never be stale.  If an id changes Z will refer to the correct object, always.  By escaping out of Z and passing around raw objects, you may accidentally read or modify the wrong object.  You may find the object you are accessing no longer exists!

You may be in a view looping through some data and you've escaped out of a query.  Instead of passing down the raw data, create a fresh query using a join and pass that in instead.


```js
// prefer
z.state.tasks().map( task => {
    let $task = 
        // cached across renders
        z.state.tasks.$values.$filter( x => x.id == y, [task.task_id])

    return m(Task, { task: $task })
})

// or
z.state.tasks().map( (task, i) => {
    let $task = 
        // cached across renders
        z.state.tasks[i]
        
    return m(Task, { task: $task })
})

// avoid
z.state.tasks().map( (task, i) => {
    // Task should have access to a query
    // not just an object
    return m(Task, { task: task })
})
```

The exception to this rule would be if the `Task` component is read only, and the data is guaranteed to be non null for all referenced properties.

This may seem cumbersome, but there are patterns to make this feel more natural.

For example, have a single task reference that edits all selected items at once.

```js
z.state.selected = [1,2,3]

let task = 
    z.state.tasks
        .$values
        .$filter( 
            (task, ids) => ids.includes(task.id) 
            , [z.state.selected]
        )

// edit 3 tasks at once
task.due_date = new Date()

// delete 3 tasks at once
task.$delete()

// get all selected tasks
let xs = [...task]
```

## Pass z.state to components not the main z instance

Z is designed to allow subcomponents to have a complete state tree they can read/write to without having the ability to excess other parts of the tree.  By only passing `z.state` to subcomponents, you can easily later refactor this reference to be a different query reference, e.g. `z.state.sandbox`.  Now all their reads and writes are sandboxed in a different sub object, but that subcomponent does not need to change any code as it was always just receiving a query, not a z instance.

It is also not recommended to allow all components to bind services.  Try to keep service definitions to route level components and have sub components simply modify state.  This makes it a lot easier to track down side effects and alter behavior without massive changes.  By only passing z.state around, these subcomponents will not be able to create services.

