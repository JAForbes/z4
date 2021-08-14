# Best Practices

#### Keep state shallow

Z is modelled a lot more like a database with tables and table joins than other UI state management systems.  Because you can create joins there is less of a need to nest data for convenience.  We can just create a query that simulates a nest by joining on the particular id(s).

A shallow state tree makes queries easy to write, it is also arguably easier to debug because state isn't super nested.

Semi-ironically given the gradual demise of rest, Z works really well with distinct resources that are joined client side.  It was designed to work well with HashQL but also makes a lot of sense in a RESTful contenxt.  Additionally because Z is reactive, it is easy to fetch additional data when required (e.g. when an id changes causes a join to become empty).

Finally, Z has to do less work the less the data is nested.  Everytime you dive through state with multiple dot chains, Z has to traverse the state tree through lazy state references, and verify parent fields are not undefined and are ready for read/write.

That isn't to say you can't nest your data, you can, and if the situation calls for it, no problem.  But if there was a grain to work with it would be flat data normalized via unique ids.

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

Z queries can never be stale.  If an id changes and an object should now be `undefined`, Z will know, but your view may not.  Even if you want access to the value before it became undefined, you should use `.$optimistic` to access a query that prefers recent uncommitted writes as long as they do not result in undefined values.

You may be in a view looping through some data and you've left query space.  Instead of passing down the raw data, create a fresh query using a join and pass that in instead.


```js
// prefer
z.state.tasks().map( task => {
    let $task = 
        z.state.tasks.$values.$filter( x => x.id == y, [task.task_id])

    return m(Task, { task: $task })
})

// or
z.state.tasks().map( (task, i) => {
    let $task = 
        z.state.tasks[i]
        
    return m(Task, { task: $task })
})

// avoid
z.state.tasks().map( (task, i) => {
    return m(Task, { task: task })
})
```

The exception to this rule would be if the `Task` component is read only, and the data is not lazy loaded.

This may seem cumbersome, but there are patterns to make this feel more natural.

For example, have a single task reference that edits all selected items at once.

```js
z.state.selected = [1,2,3]

let task = 
    z.state.tasks
        .$values
        .$filter( 
            (task, ids) => ids.includes(task.id) 
        )

// edit 3 tasks at once
task.due_date = new Date()
```

Another option is to create a new z instance focusing on a specific object.  This is a great option for views that do not interact with the rest of the state tree, for example a form.


```js
z.state.tasks().map( (task, i) => {
    return m(Task, { task: new Z({ state: task }).state })
})
```

Z will check if it already has an instance for that subtree by reference, so repeated invocations will not create repeated Z instances.

There is a shortcut for this `.$partition()`:

```js
z.state.tasks().map( (task, i) => {
    return m(Task, { task: z.state.tasks[i].$partition().state })
})
```

A database partition is a separate table that manages a subset of the overall data.  It is used when a table has too much data that query time starts to suffer.  Usually a partition is created to handle data within a particular date range, region, or set of customers.  Data that is often queried together is in the same partition.

The same pattern applies in Z.  We're still writing to the same mutable state tree.  We're not creating a new state tree - we are just creating a new set of caches and notification systems.  Two shards have no awareness of eachother even though they write to the same single state tree.

#### Use partitions only when necessary

When you partition state, we also partition our ability to react to state changes.  E.g. if we are listening to changes on 2 sets of data in 2 different partitions our service will never activate because it will never be notified of the data change from the other partition.

```js
let z1 = z.state.users.$partition()
let z2 = z.state.roles.$partition()

z1.service([z1.state.users, z2.state.roles], function * () {
    // never notified of z2 updates
})

z2.service([z1.state.users, z2.state.roles], function * () {
    // never notified of z1 updates
})

z.service([z1.state.users, z2.state.roles], function * () {
    // never notified of z1 or z2 updates
})
```
