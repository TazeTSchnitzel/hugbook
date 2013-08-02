var express = require('express'),
    consolidate = require('consolidate'),
    https = require('https'),
    fs = require('fs'),
    crypto = require('crypto');

var config = require('./config.json');

try {
    var data = require('./data.json');
} catch (e) {
    data = {
        num_hugs: 0,
        num_users: 0,
        users: {},
        hashes: {},
        last_user: null
    };
}

function timestamp() {
    return (new Date()).toISOString();
}

function doHash(data, algo) {
    var h = crypto.createHash(algo);
    h.update(data);
    return h.digest('hex');
}

function hashEmail(email) {
    return doHash(data + config.email_secret, 'sha256');
}

function saveData() {
    fs.writeFileSync('data.json', JSON.stringify(data));
}

function personaAssert (assertion, callback) {
    var postdata;

    postdata = 'assertion=' + assertion + '&audience=' + config.origin;

    var req = https.request({
        hostname: 'verifier.login.persona.org',
        method: 'POST',
        path: '/verify',
        headers: {
            'Content-Length': postdata.length,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    }, function (res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            var data = JSON.parse(chunk);
            if (data.status === 'okay') {
                callback(true, data.email);
                return;
            }
            callback(false);
        });
    });

    req.on('error', function (e) {
        callback(false);
    });

    req.write(postdata);
    req.end();
}


function getSessionData (request) {
    var returndata = {}, viewdata = {};
    if (request.signedCookies.hasOwnProperty('user')) {
        viewdata.loggedin_json = JSON.stringify(request.signedCookies.user);
        viewdata.logged_in = true;
        returndata.userdata = data.users[request.signedCookies.user];
        viewdata.nick = returndata.userdata.nick;
        viewdata.yourhugs = returndata.userdata.hugs.length;
        viewdata.url = '/user/' + returndata.userdata.hash;
        returndata.email = request.signedCookies.user;
        returndata.loggedin = true;
    } else {
        viewdata.loggedin_json = JSON.stringify(null);
        viewdata.logged_in = false;
        returndata.loggedin = false;
    }
    returndata.viewdata = viewdata;
    return returndata;
}

var app = express();

// assign the mustache engine to .html files
app.engine('html', consolidate.mustache);;

// set .html as the default extension 
app.set('view engine', 'html');

app.set('views', __dirname + '/views');

// parsing for POSt requests
app.use(express.bodyParser());

// secret for signed cookies
app.use(express.cookieParser(config.cookie_secret));

app.get('/', function(req, res){
    var u = getSessionData(req);
    var viewdata = u.viewdata;
    viewdata.numpeeps = data.num_users;
    viewdata.numhugs = data.num_hugs;
    viewdata.avghugs = Math.ceil(data.num_hugs/data.num_users);
    if (data.last_user) {
        viewdata.newestuser_nick = data.users[data.last_user].nick;
        viewdata.newestuser_url = '/user/' + data.users[data.last_user].hash;
    }
    res.render('index', viewdata);
});

app.get('/user/:hash', function(req, res) {
    var u = getSessionData(req);
    var viewdata = u.viewdata;
    if (!data.hashes.hasOwnProperty(req.params.hash)) {
        res.send("No such user");
        return;
    }
    var userdata = data.users[data.hashes[req.params.hash]];
    viewdata.user_nick = userdata.nick;
    viewdata.user_hugs = userdata.hugs.length;
    if (u.loggedin && u.email !== data.hashes[req.params.hash]) {
        viewdata.user_huggable = true;
        viewdata.user_hug_url = '/user/' + req.params.hash + '/hug';
    } else {
        viewdata.user_huggable = false;
    }
    res.render('user', viewdata);
});

app.post('/user/:hash/hug', function(req, res) {
    var u = getSessionData(req);
    var viewdata = u.viewdata;
    if (!data.hashes.hasOwnProperty(req.params.hash)) {
        res.send("No such user");
        return;
    }
    if (!u.loggedin) {
        res.send("You need to be logged in to hug");
        return;
    }
    if (u.email === data.hashes[req.params.hash]) {
        res.send("You can't hug yourself!");
        return;
    }
    u.userdata.hugs.push({
        to: data.hashes[req.params.hash]
    });
    data.users[data.hashes[req.params.hash]].hugs.push({
        from: u.email
    });
    data.num_hugs++;
    saveData();
    res.redirect('/user/' + req.params.hash);
});

app.post('/login', function (req, res) {
    personaAssert(req.body.assertion, function (good, email) {
        if (!good) {
            res.send("Bad assertion received - login failed");
        } else {
            if (!data.users.hasOwnProperty(email)) {
                data.users[email] = {
                    hugs: [],
                    friends: [],
                    nick: email.split('@')[0],
                    hash: hashEmail(email),
                    created: timestamp()
                };
                data.hashes[hashEmail(email)] = email;
                data.num_users++;
                data.last_user = email;
                saveData();
            }
            res.cookie('user', email, { signed: true });
            res.redirect('/');
        }
    });
});

app.get('/logout', function (req, res) {
    res.clearCookie('user', { signed: true});
    res.redirect('/');
});

app.use("/media", express.static(__dirname + '/media'));

app.listen(config.port);
