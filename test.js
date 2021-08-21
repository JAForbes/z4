import test from 'tape'
import Z from './z.js'
import Transaction from './transaction.js'

test('keys', t => {
    
    let z = new Z()

    t.equals(
        z.state.a.b.c.$path.key
        , 'a.b.c', 'Basic key'
    )
    t.equals(
        z.state.a.b.c.$values.$filter( (x,y) => x.id == y, [z.state.id])
            .$path.key
        , 'a.b.c.$values.$filter((x,y) => x.id == y, [id])', 'Complex key'
    )
    t.end()
})

test('get', t => {

    let z = new Z()
    let tree = z.state()

    t.doesNotThrow( () => z.state(), 'Can access root state object')

    let d = z.state.a.b.c.d
    d(4)
    z.state.a.b.c.d = 4
    t.equals(tree.a.b.c.d, 4, 'Nested set')
    
    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]
    z.state.id = 2

    t.equals(z.state.users.$values.$all().map( x => x.id ).join('|'), '1|2|3', '$values get')

    t.equals(z.state.users.$values.$map( x => x.id + 1 ).$all().join('|'), '2|3|4', '$map get')

    t.equals(z.state.users.$values.$filter( x => x.id == 2 )().id, 2, '()')

    t.equals(z.state.users.$values.$filter( x => x.id == 2 ).valueOf().id, 2, 'valueOf')
    t.equals(z.state.users.$values.$filter( x => x.id == 2 ).id(), 2, 'Sub paths of dynamics')
    t.end()
})

test('set', t => {
    let z = new Z()
    let tree = z.state()
    
    z.state.users = [{ id: 1, name: 'Joe' }, {id: 2, name: 'Jack' }, {id: 3, name: 'James' }]
    z.state.id = 3

    t.equals(tree.id, 3, 'value')
    t.equals(tree.users.map( x => x.id ).join('|'), '1|2|3', 'list')

    z.state.id(5)
    t.equals(tree.id, 5, 'value')

    z.state.id(x => x - 1)
    t.equals(tree.id, 5 -1, 'fn')

    let not1 = z.state.users.$values.$filter( x => x.id > 1 )
    // should get/set name of each user, not [].name
    let name = not1.name
    name()
    not1.friends = [1,3]

    // writing directly to a filter
    not1( x => ({ ...x, additional: true }))

    t.equals(
        z.state.users.$values.additional.$all().map( x => typeof x).join('|')
        ,'undefined|boolean|boolean'
    )

    z.state.id = 2

    let user = 
        z.state
            .users
            .$values
            .$filter( (x,y) => y == x.id, [z.state.id])

    let friends = 
        z.state.users
            .$values
            .$filter( (x,ys) => ys.includes(x.id), [user.friends] )

    t.equals( user.name(), 'Jack', 'User targeted' )
    t.equals( friends.$values.name.$all().join('|'),  'Joe|James', 'Friends targeted')

    friends.jacksFriend = true

    t.equals(
        z.state.users.$values.$filter( x => x.jacksFriend).name.$all().join('|'),
        friends.name.$all().join('|'),
        'Writing to complex query reflected in new disconnected query state'
    )

    t.end()
})

test('delete', t => {
    let z = new Z()
    let tree = z.state()
    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]

    delete z.state.users.$values
    t.equals(tree.users.length, 0, 'clear list')

    delete z.state.users
    t.equals(tree.users, undefined, 'delete list')

    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]
    z.state.users.$filter( xs => xs.length > 1 ).$delete()

    t.equals(tree.users, undefined, 'delete list if predicate matches pt 1')

    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]
    z.state.users.$filter( () => false ).$delete()

    t.equals(tree.users.length, 3, 'delete list if predicate matches pt 2')

    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]
    z.state.users.$values.$filter( x => x.id > 1 ).$delete()

    t.equals(tree.users.map( x => x.id ).join('|'), '3', 'delete matching elements')

    z.state.x = 1
    delete z.state.x

    t.equals(tree.x, undefined, 'Normal property delete')

    t.end()
})

test('dependencies', t => {
    let z = new Z()
    let user = z.state.users
        .$values
        .$filter( (x,y) => x.id == y, [z.state.id] )

    z.state.users = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }]
    z.state.id = 2

    t.equals(user().id, 2, 'Filter with dependencies works')

    z.state.symbol = '!!!'
    let yell = z.state.users
        .$values
        .$map( (x,y) => ({ ...x, name: x.name + y }), [z.state.symbol] )
        
    t.equals(yell.$all().map( x => x.name ).join('|'), 'a!!!|b!!!|c!!!', '$map with deps works')
    t.end()
})

test('caching dynamics', t => {
    let z = new Z()
    let called = { user: 0 }
        
    let user = z.state.users
        .$values
        .$filter( (x,y) => {
            called.user++
            return x.id == y
        }, [z.state.friend.id] )

    let list =  [{ id: 1 }, { id: 2 }, { id: 3 }]
    z.state.users = list
    z.state.friend.id = 2

    t.equals(called.user, 0, 'Base state')

    user()

    t.equals(called.user, list.length * 1, 'Invoked on first read')

    user()

    t.equals(called.user, list.length * 1, 'Not invoked on first read')
    user()
    user()
    user()
    
    t.equals(called.user, list.length * 1, 'Not invoked on subsequent reads')

    z.state.users = [{ id: 1 }, { id: 2 }, { id: 4 }]

    user()

    t.equals(called.user, list.length * 2, 'Invoked on first read after write')

    user()
    user()
    user()

    t.equals(called.user, list.length * 2, 'Not invoked on subsequent reads after write')

    t.end()
})

test('caching proxies', t => {
    let z = new Z()

    t.equals(z.state.a.b.c.d == z.state.a.b.c.d, true, 'Proxies are cached')
    t.end()
})

test('use cached read/write when preventing set', t => {

    let xs = []
    let original = Z.prototype.onbeforeset
    let cachedValues = new Map()
    let cacheAccessed = 0
    class Z2 extends Z {
        cachedValues = new Proxy(cachedValues, {
            get(target, key){
                if( key == 'get' ) {
                    cacheAccessed++
                } 
                
                if( typeof target[key] == 'function' ) {
                    return (...args) => target[key](...args)
                }
                return Reflect.get(target, key)
            }
        })
        onbeforeset(...args){
            let allowed = original.call(this, ...args)
            xs.push(allowed)
            return allowed
        }
    }

    let z = new Z2()

    cacheAccessed = 0
    z.state.x = 2
    z.state.x = 2
    t.equals(cacheAccessed, 1, 'Cache was accessed on write')

    t.equals(xs.join('|'), 'true|false', 'Set prevented by reading cache on second write')

    cacheAccessed = 0
    cachedValues.clear()
    z.state.x = 3
    z.state.x()

    t.equals(cacheAccessed, 1, 'Cache was accessed on read after write')

    cachedValues.clear()
    z.state.x()
    cacheAccessed = 0
    z.state.x = 3
    t.equals(cacheAccessed, 1, 'Cache was accessed on write after read')
    t.end()
})

test('.$default', t => {

    let z = new Z()

    let a = z.state.a.b.c.d.$default(4)
    
    z.state.a.b.c.d(5)
    
    let b = z.state.a.b.c.d.$default(4)

    t.equals(a, 4, 'Default works when valueOf returns undefined')

    t.equals(b, 5, 'Default returns real value when valueOf != undefined')

    t.end()
})

test('iterator support', t => {
    let z = new Z()

    z.state.users = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }]

    let out = []
    for(let x of z.state.users.$values.id){
        out.push(x)
    }
    t.equals(out.join('|'), '1|2|3', 'Queries can use for loops')
    t.end()
})

test('Transactions', async t => {
    let z = new Z()

    z.state.a = 1
    let a = new Transaction(z, function * example (z){
        z.state.a = 2
    })

    await a.run()

    t.equals(z.state.a(), 2, 'Transaction committed changes to main tree')

    let b = new Transaction(z, function * example (z){
        z.state.a = 3
        throw new TypeError('Whatever')
    })

    await b.run().catch(() => {})

    t.equals(z.state.a(), 2, 'Transaction changes never committed on exception')
    t.equals(b._state.constructor.name, 'Rollback', 'State is Rollback')

    z.state.b = 2
    
    z.service([z.state.b], function * (z2){
        t.equals(z2.state.a(), 2, 'Before global state change')
        z.state.a(4)
        t.equals(z2.state.a(), 4, 'Global state change observable in tx')
    })
})

test('simple subscriptions', t => {
    let z = new Z()
    
    let called = { user: 0, users: 0, friend: 0 }
    
    z.service([z.state.users], function * (){ called.users++ })
    
    let user = z.state.users
        .$values
        .$filter( (x,y) => x.id == y, [z.state.friend.id] )

    z.service([user], function * (){
        called.user++
    })
    t.equals(called.user, 0, 'Subscription not called.user when tree empty')
    
    z.state.users = [{ id: 1 }, { id: 2 }, { id: 3 }]

    t.equals(called.user, 0, 'Subscription not called.user when tree empty pt 2')
    z.state.friend.id = 2
    z.service([z.state.friend.id], function * (){ called.friend++ })

    t.equals(called.user, 1, 'Subscription called.user once all deps are ready')

    z.state.friend.id = 2
    t.equals(called.user, 1, 'Setting a value to itself does not dispatch a notification')

    let copy = z.state.users()
    z.state.users = copy
    t.equals(called.user, 1, 'Setting a value to itself does not dispatch a notification pt2')
    
    z.state.friend.id = 3
    t.equals(called.user, 2, 'Updating a dependency updates the notification')

    t.end()
})

test('service cancellation (latest)', async t => {

    let z = new Z()
    
    let forever = new Promise(function(){})
    let immediate = Promise.resolve()
    let promises = [forever, immediate]

    let count = { finally: 0, try: 0, catch: 0, completed: 0 }
    let err;
    z.service([z.state.a], function * (z){ 
        try {
            count.try++
            z.state.promisesLength = promises.length
            yield promises.shift()
            count.completed++
        } catch (e) {
            count.catch++
            err = e
        } finally {
            count.finally++
        }
    }, { resolve: 'latest' })

    z.state.a = 1
    await Promise.resolve()
    let firstLength = z.state.promisesLength()
    z.state.a = 2

    await z.drain()
    let secondLength = z.state.promisesLength()

    t.equal(count.finally, 2, 'Finally always called')
    t.equals(count.try, 2, 'Service started once per invocation')
    t.equals(count.catch, 1, 'First was cancelled (1/2)')
    t.equals(err.constructor.name, 'CancellationError', 'First was cancelled (2/2)')
    t.equals(count.completed, 1, 'Second service completed')
    t.equals(firstLength, undefined, 'Cancelled write never merged upstream')
    t.equals(secondLength, 1, 'Clean exit commit changes to tree')

    t.end()
})

test('service cancellation (earliest)', async t => {

    let z = new Z()
    
    let carryOn;
    let paused = new Promise(function(Y){ carryOn = Y })

    let count = { finally: 0, try: 0, catch: 0, completed: 0 }
    let err;

    z.service([z.state.a], function * (z){ 
        try {
            count.try++
            z.state.b = 'hello'
            yield paused
            count.completed++
        } catch (e) {
            count.catch++
            err = e
        } finally {
            count.finally++
        }
    }, { resolve: 'earliest' })

    z.state.a = 1
    await Promise.resolve()
    z.state.a = 2
    await Promise.resolve()
    
    let beforeCommit = z.state.b()
    carryOn(true)
    await z.drain()
    await paused

    t.equal(count.finally, 1, 'Finally only called for service that started')
    t.equals(count.try, 1, 'Subsequent services ignored')
    t.equals(count.catch, 0, 'Second was ignored (1/2)')
    t.equals(err, undefined, 'No cancellation error occurred')
    t.equals(count.completed, 1, 'First service completed')
    
    t.equals(beforeCommit, undefined, 'Before commit, b is unset')
    t.equals(z.state.b(), "hello", 'Clean exit commit changes to tree')

    t.end()
})

test('service debouncing', async t => {
    let z = new Z()
    
    // here we fake setTimeout/clearTimeout
    // so we can semi synchronously test debouncing
    // with having slow tests
    {
        let timeouts = {
            id: 1
            ,idx: {}
            ,time: 0
        }
    
        z.setTimeout = function(visitor,ms){
            let id = timeouts.id++
            timeouts.idx[id] = { id, time: timeouts.time + ms, visitor }
            return id
        }
        z.clearTimeout = function(id){
            delete timeouts.idx[id]
        }
        
        z.setTimeout.advance = function(ms){
            timeouts.time += ms
    
            let xs = 
                Object.values(timeouts.idx)
                    .filter( x => x.time <= timeouts.time )
    
            for(let x of xs){
                delete timeouts.idx[x.id]
                x.visitor()
            }
        }
    }

    let carryOn;
    let paused = new Promise(function(Y){ carryOn = Y })

    let count = { finally: 0, try: 0, catch: 0, completed: 0 }
    let err;

    z.service([z.state.a], function * (z){ 
        try {
            count.try++
            z.state.b = 'hello'
            yield paused
            count.completed++
        } catch (e) {
            count.catch++
            err = e
        } finally {
            count.finally++
        }
    }, { resolve: { debounce: 50 } })

    z.state.a = 1
    await Promise.resolve()
    
    z.setTimeout.advance(25)

    z.state.a = 2
    await Promise.resolve()

    z.setTimeout.advance(25)

    z.state.a = 3
    await Promise.resolve()

    z.setTimeout.advance(25)

    z.state.a = 4
    await Promise.resolve()

    z.setTimeout.advance(25)

    t.equals(count.try, 1, 'Only the first service was started')
    t.equals(count.catch, 0, 'The first service isnt cancelled when the debounce hasnt timed out')

    z.setTimeout.advance(25)
    await Promise.resolve()

    t.equals(count.try, 2, 'The last service is now running, and...')
    t.equals(count.catch, 1, 'The first service has been cancelled')

    
    let beforeCommit = z.state.b()
    carryOn(true)
    await z.drain()
    await paused

    t.equal(count.finally, 2, 'Finally invoked for cancellend and finished service')
    t.equals(count.try, 2, 'Only the first and last service executed')
    t.equals(count.catch, 1, 'First was cancelled')
    t.equals(err.constructor.name, 'CancellationError', 'No cancellation error occurred')
    t.equals(count.completed, 1, 'Final service completed')
    
    t.equals(beforeCommit, undefined, 'Before commit, b is unset')
    t.equals(z.state.b(), "hello", 'Clean exit commit changes to tree')

    t.end()  
})


test('query references', t => {
    let z = new Z()

    let user = 
        z.state
            .users
            .$values
            .$filter( (x,y) => y == x.id, [z.state.id])

    z.state.user = user

    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]
    z.state.id = 2

    t.equals(user.id(), 2, 'Normal query works')
    t.equals(z.state.user.id(), 2, 'Referenced query works')
    t.equals(user, z.state.user, 'Both queries have same reference')
    
    t.end()
})

// This will not work until #12 is fixed, but the test itself
// is fine so I'm just skipping for now
test('query references within transactions', async t => {
    let z = new Z()

    let user = 
        z.state
            .users
            .$values
            .$filter( (x,y) => y == x.id, [z.state.id])

    z.state.user = user

    z.state.users = [{ id: 1}, {id: 2}, {id: 3}]
    z.state.id = 2

    let fetch = async (url) => {
        let [,,, id] = url.split('/')

        if(id == 2) {
            return { metadata: 'yes' }
        } else {
            throw new Error(500)
        }
    }

    z.service([z.state.user], function * (z){

        let user = z.state.user
        let id = user.id()

        let { metadata } = yield fetch('/api/users/' + id)

        z.state.user.metadata = metadata
        
    })

    await Promise.resolve()
    await z.drain()

    t.equals( z.state.user.metadata, 'yes', 'Query reference within transaction worked' )

    t.end()
})