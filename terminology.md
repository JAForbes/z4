# State Tree

A mutable javscript object that stores the data that executed queries read and write from.

## Query

A query is an expression acting as a description of state to access.  A query can be executed as a read, write, or delete operation.  A query operates on sets, but by default returns the first value of a set.

Queries look similar to normal javascript property access, but there are special operations like `$filter`, `$values`, `$map`, `$delete` as well.

> 🤓 All special operations on queries are prefixed with a `$` sign.

A query expression is not bound to a particular state tree, it is immutable and permanently cached after first invocation.

Queries are both reactive (like streams/observables), and stateless (like lenses/optics).  On invocation, Z4 passes its current state into the query to evaluate a result but the state is not stored on the query, it is stored centrally in a distinct state tree.

A query ultimately is a JS Proxy with a Path object.  The `Path` object stores each distinct component of the query, these distinct components are called `Op`'s.  `Op`'s are also just decriptions of an operation, the exact execution of a set of `Op`'s is left at the discretion of the `Path` and `Z4`.  This is much like a database, where your query may not be executed in the manner it is logically defined, despite the final output being equivalent.

## Dynamic Query

A dynamic query is a query that uses a visitor function as part of its query expression.  This includes operations like `.$filter`, `.$map`.  Dynamic queries are an important part of Z4 but can lead to de-optimized propagation as Z4 does not analyze the visitor function and instead assumes at worst it could have reference any child value.  We recommend using dynamic queries liberally, but to prefer [shallow normalized state trees](./best-practices.md#keep_state_shallow).

## Key

A key is a unique string representation of a given query or service.  If two queries have the same key, Z4 will treat them as the same query.  Key's are automatically generated based on the query expression itself.  It is possible the auto generated key can collide with other queries if you do not follow [best practices](./best-practices.md#Never_access_closured_queries_in_a query_visitor_function) when defining dynamic queries.

## Transaction

A transaction is a generator function with its own view on the state tree.  When it reads from its own state tree it inherits values from the parent state tree automatically.  The only time a transaction's state tree can drift from the parent state tree is if the transaction writes to it.

Transaction state tree modifications are only committed back to the parent state tree when the generator function exits without throwing an uncaught exception.  If there is an exception, the transaction state is discarded.

A transaction can `yield` promise values to perform side effects.  It can also yield other values which are observed via custom middleware to perform other side effects.

Transactions only use generator functions as generator functions can be externally cancelled which is an important, unique feature of Z4.  No service can never ever have two parallel transactions, either the former or the latter execution must be cancelled.

## Service

A service observes changes in Z4 query results and executes a transaction in response.  A service has a key (just like queries) and this allows Z4 to manage automatic cancellation when duplicate services are triggered.

Services are the only way to create a transaction in Z4.

A service when triggered multiple times before a transaction can end must either ignore new invocations, or cancel the existing transaction before starting a new one.  This constraint is introduced to provide strong guarantees on state modifications in Z.

- Writes outside of services are instant and synchronous
- Because writes are mutable and state is centralized, there is no need to propagate new state
- Writes within services are local to the current transaction, but are also instant and synchronous
- Writes within a transaction are only re-applied to the parent tree when a transaction exits cleanly
- Transaction writes are replayed on commit using the latest tree state.
- Transaction execution is parallel, but transaction commits are sequential.

## Path

...

## Op

...