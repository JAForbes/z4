# API

## Z4 -> Z4Instance

`new Z4<T>({ state::T })`

### `.state`

`z4.state()`

The root Query proxy.

### `.end`

`z4.end()`

Ends all services, subscriptions, transactions and ignores future writes.  Does not affect internal state or reads in case asynchronous component tear down is still occuring.

After calling end, Z4 should automatically be garbage collected by the JS engine because there is no direct references to any state internally.

## Query

### Getter

`query() :: <T> () => state::T`

### Setter

`query(newState) :: <T> (state:T) => T`

### Deletion

`delete query.property` | `query.property.$delete()`

### Property Access

`query.property :: { [string|number] : Query }`

### `.$values`

`query.$values :: Query`

Lifts a result containing arrays into a result containing each value in each array.

```js
// Without .$values, .$filter operates on the entire list
z.state.users.$filter( xs => xs.length > 5 )

// With .$values, .$filter operates on each item in users
z.state.users.$values.$filter( x => x.id > 5 )

// .$values lets you update all items in a list simultaneously
z.state.users.$values.auth_expiry = Date.now()

// .$values lets you clear a list without deleting the list itself
delete z.state.users.$values
```

### `.$filter`

`.$filter((value, ...dependencies ) -> Boolean, dependencies?, key?) -> Query`

Removes items from a result set that do not match a user provided predicate function

### `.$delete`

`.$delete :: () => Boolean`

Deletes a value from the state tree.

### `.$map`

`.$map( (value, ...deps) -> value), dependencies?, key?) -> Query`

Creates a read only query that transforms state using the user provided visitor function.

## Service

### `z.service`

`z.service(Query[], *( z::Z4 ) -> void, options? ) -> ServiceInstance`

### `options`

#### `options.preferLatest` `(true)` 

Whether to cancel the new or previous transaction when a service is triggered

#### `options.debounce` `(0)` 

The number of milliseconds to wait before commencing a new transaction when a new value is received if a transaction is already running.

### ServiceInstance

#### `.end`

`service.end()`

Stops a service from responding to query result changes and deletes the service
from the service cache.
