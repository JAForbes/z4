# Subscriptions

> This is just me thinking out loud.

If I subscribe to a value, I need to be notified when that value changes, or when any child changes.
I also need to be notified when a subset of parent changes occur.

This is all pretty simple, when a parent is updated, all the children get notified.

When a child gets updates, the parent notifications go off, but not children of the parent.

```js
z.on([a], function(){
    console.log('🍕')
})

z.on([a.b], function(){
    console.log('🍎')
})

z.on([a.b.c], function(){
    console.log('🍌')
})

z.on([a.b.d], function(){
    console.log('🍊')
})

a(...)
// 🍕🍎🍌🍊

a.b(...)
// 🍕🍎🍌

a.b.c(...)
// 🍕🍎🍌

a.b.d(...)
// 🍕🍊
```

This is just to notify of a change, the changes themselves do not need value propagation except for dynamic queries like `$map`, `$filter` and `$values` and (children of dynamic values).

Notifying subscriptions of dynamic queries works exactly the same, for each level we update the static queries first, followed by the dynamics followed by the next level and so it repeats.  For dynamics, `$values` runs first, followed by `$filter`, followed by `$map`.  If there are multiple levels of dynamics they are treated as the same level as the first static property.

If an unrelated child is updated, every dynamic child of the parent of the child is notified.

E.g. if I update `a.b.d`, `a.b.$values` needs to be notified, and `a.$values`, but not `a.b.c.$values`

```js
z.on([a.$values.$filter(...).$map], function(){
    console.log('🍎')
})

z.on([a], function(){
    console.log('🍕')
})

z.on([a.b.$values], function(){
    console.log('🥑')
})

z.on([a.b], function(){
    console.log('🍊')
})

z.on([a.b.c], function(){
    console.log('🍌')
})

z.on([a.b.d], function(){
    console.log('🍍')
})


a(...)
// 🍕🍎🍊🥑

a.b(...)
// 🍕🍎🍊🥑

a.b.c(...)
// 🍕🍎🍊🥑🍌

a.b.d(...)
// 🍕🍎🍊🥑🍍
```

These ordered notification paths are calculated whenever a new notification is defined.  Usually notifications are defined at the start of a component whereas queries are created dynamically for the life time of a component.  So the path creation is a start up cost.

Before a notification fires a reference equality check will occur except if `{repeats: false}` is set in the notification options.  So by default a notification will not fire if the value has not changed.

But, we still loop through the specific notification list to ask the query if it should notify because a parent reference equality may be the same, but a child reference equality may have changed.  This is because we mutate the state tree.  If the child reference changes, the parent reference usually won't.

We perform this equality check in reverse notification order.  If all children deem reference equality is the same, there is no point asking the parents.

When a write occurs, we record if it was a primative value like a `string` or a `number`.  We only need to do reference checks if a complex value is passed in like an array of object.