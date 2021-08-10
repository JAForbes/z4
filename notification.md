Notification
============

> Just me thinking out loud

When a field is updated, there could be a subscription on that field or other fields that would be affected by said field.

Because Z4 mutates, these other fields do not need to propagate and refresh their values.  But we need to simulate that propagation
to check if there is any notifications that need to occur.

There won't be a lot of notifications, and some are easy to filter out.  So it is probably pretty fast to just iterate through all notifications and early exit.

So if a write occurs at `a.b.c` and there is a notification at `a` and `e.a` we can just loop through and then check that each notification has a shared lineage, if not, we do not notify.  Because `e.a` could not be affected by a write of `a.b.c`

So for `a.b.c` in a tree `{ a { b { c} }, b { b { c } }, c { b { c } }, d { b { c } }, e { b { c}} }` only children of `a`, and children of `a.b` and children of `a.b.c` need to be notified.

If we have an index of all nodes by parent key we can build that list easily.  And then cache it until a new proxy is created.  There would need to be a list for each key in the tree, so potentially its not worth while to store the cached list for every node, but only nodes that have been written to in the past.

Currently `proxies` is a flat dictionary.  But if instead it was a nested index by parent key of the form `{ a: { nodes, children: { b: { nodes, children }, ...}, ... }}` we can loop through relevant fields.

---

Dependencies ruin this simplicity.  When building that graph you also need to track the dependencies.  

```js
let user = z.state.users
    .$values
    .$filter( (x,y) => x.id == y, [z.state.id] )

user.name
```

There are several queries involved here:

- A: `users`
- B: `users.$values`
- C: `(user) users.$values.$filter(..., [friend.id])`
- D: `friend.id`
- E: `user.name`
- F: `friend`

If `A` updates, a notification on `A`, `B`, `C`, `E` would need to occur.

If `B` updates, a notification on `A`, `B`, `C`, `E` would need to occur

If `C` updates, a notification on `A`, `B`, `C`, `E` would need to occur

If `D` updates, a notification on `C`, `D`, `E` and `F` would need to occur

If `E` updates, a notification on `A`, `B`, `C` and `E` would need to occur

If `F` updates a notification on `F`, `E`, `D` and `C` would need to occur 

`D` can trigger updates on any children of that dynamic query inclusively.  But it lives elsewhere in the tree.  In effect, these elements become children of `id`.  But how do we evaluate that efficiently?  We could easily have a situation where evaluating the children of `id` resolves to an infinite loop.

I think when a proxy is created, we check if the `lastPart` has dependencies.  If so, we register it somewhere.  But, what about `F`.  `F` is not a dependency of any queries, but updating `F` will update `D` which is.  So do we cache that?  Do we cache that all parent values of a dependency could trigger another part of the tree?

Maybe it is better to take an OO approach, and copy streams but simply separate the phases.  In streams we recursively traverse the graph of dependencies and evaluate at the same time.  But with Z4 we could recursively traverse the stream graph, but collect a set of keys.  And then loop through that set as a separate phase.

We can cache that set when the queries settle, and we can only compute it when a write occurs.

So each proxy would have a list of parents?  Or a list of children?  It would likely be easier to manage as a list of parents because then parents do not need to know about their children and we usually write to leaves.

---

I think Z3 can be instructive here.  A child should inherit the list of triggers from its parent, and then add its own.  When an element is pruned, there is a little work to update those lists.  But it may suffice to just prune the list whenever it is accessed to make teardown a little quicker as that is often when we're animating.