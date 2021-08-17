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

test('simple subscriptions', t => {
    let z = new Z()
    
    let called = { user: 0, users: 0, friend: 0 }
    
    z.on([z.state.users], () => called.users++)
    
    let user = z.state.users
        .$values
        .$filter( (x,y) => x.id == y, [z.state.friend.id] )

    
    z.on([user], function(){
        called.user++
    })
    t.equals(called.user, 0, 'Subscription not called.user when tree empty')
    
    z.state.users = [{ id: 1 }, { id: 2 }, { id: 3 }]

    t.equals(called.user, 0, 'Subscription not called.user when tree empty pt 2')
    z.state.friend.id = 2
    z.on([z.state.friend.id], () => called.friend++)

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

test.only('deferrable subscriptions', async t => {
    let z = new Z()

    let a = new Transaction(z, function * example (z){
        yield new Promise( Y => setTimeout(Y, 10 ))
        yield new Promise( Y => setTimeout(Y, 10 ))
        yield new Promise( Y => setTimeout(Y, 10 ))
    })

    await a.run()

    t.end()
})