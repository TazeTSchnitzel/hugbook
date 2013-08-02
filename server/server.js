var express = require('express'),
    consolidate = require('consolidate'),
    https = require('https'),
    fs = require('fs'),
    crypto = require('crypto'),
    moment = require('moment'),
    _ = require('underscore');

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

var leaderboard = [];

var sessions = {};

function recalculateLeaderboard() {
    leaderboard = _.sortBy(data.users, function (user) {
        return -user.hugs.length;
    }).slice(0, 10);
}

function timestamp() {
    return (new Date()).toISOString();
}

function randomB36() {
    var out = '', i = 0;
    for (i = 0; i < 20; i++) {
        out += (Math.random() * 36).toString(36);
    }
    return out;
}

function doHash(data, algo) {
    var h = crypto.createHash(algo);
    h.update(data);
    return h.digest('hex');
}

function hashEmail(email) {
    return doHash(email + config.email_secret, 'sha256');
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
    if (request.signedCookies.hasOwnProperty('session')
        && sessions.hasOwnProperty(request.signedCookies.session)) {
        returndata.userdata = data.users[sessions[request.signedCookies.session]];
        viewdata.logged_in = true;
        viewdata.nick = returndata.userdata.nick;
        viewdata.yourhugs = returndata.userdata.hugs.length;
        viewdata.url = '/user/' + returndata.userdata.hash;
        viewdata.full_url = config.origin + viewdata.url;
        returndata.email = sessions[request.signedCookies.session];
        viewdata.loggedin_json = JSON.stringify(returndata.email);
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
    viewdata.leaderboard = leaderboard.map(function (data) {
        return {
            leader: data.nick,
            leader_url: '/user/' + data.hash,
            leader_hugs: data.hugs.length
        };
    });
    if (data.last_user) {
        viewdata.newestuser_nick = data.users[data.last_user].nick;
        viewdata.newestuser_url = '/user/' + data.users[data.last_user].hash;
        viewdata.newestuser_date = moment(data.users[data.last_user].created).fromNow();
    }
    viewdata.homepage = true;
    res.render('index', viewdata);
});

app.get('/user/:hash', function(req, res) {
    var u = getSessionData(req);
    var viewdata = u.viewdata;
    if (!data.hashes.hasOwnProperty(req.params.hash)) {
        res.send("No such user");
        return;
    }
    var theiremail = data.hashes[req.params.hash];
    var userdata = data.users[theiremail];
    viewdata.user_nick = userdata.nick;
    viewdata.user_hugs = userdata.hugs.length;
    viewdata.user_date = moment(userdata.created).fromNow();
    viewdata.user_huggable = false;
    if (!u.loggedin) {
        viewdata.canthug_reason = "You need to be logged in to hug.";
    } else if (u.email === theiremail) {
        viewdata.canthug_reason = "You can't hug yourself.";
    } else if (u.userdata.last_hugs.hasOwnProperty(theiremail) !== null && ((new Date()) - (new Date(u.userdata.last_hugs[theiremail])) < (config.hug_timeout_seconds * 1000))) {
        viewdata.canthug_reason = "You can only hug a given person once every " + config.hug_timeout_english + ", and your last hug was " + moment(u.userdata.last_hugs[theiremail]).fromNow();
    } else {
        viewdata.user_huggable = true;
        viewdata.user_hug_url = '/user/' + req.params.hash + '/hug';
    }
    viewdata.user_huglist = userdata.hugs.map(function (hugdata) {
        if (hugdata.hasOwnProperty('to')) {
            return {
                to: data.users[hugdata.to].nick,
                to_url: '/user/' + data.users[hugdata.to].hash,
                date: moment(hugdata.date).fromNow()
            };
        } else {
            return {
                from: data.users[hugdata.from].nick,
                from_url: '/user/' + data.users[hugdata.from].hash,
                date: moment(hugdata.date).fromNow()
            };
        }
    }).reverse();
    viewdata.userpage = true;
    res.render('index', viewdata);
});

app.post('/user/:hash/hug', function(req, res) {
    var u = getSessionData(req);
    var viewdata = u.viewdata;
    if (!data.hashes.hasOwnProperty(req.params.hash)) {
        res.send("No such user");
        return;
    }
    var theiremail = data.hashes[req.params.hash];
    if (!u.loggedin) {
        res.send("You need to be logged in to hug");
        return;
    }
    if (u.email === theiremail) {
        res.send("You can't hug yourself!");
        return;
    }
    if ((u.userdata.last_hugs.hasOwnProperty(theiremail) && ((new Date()) - (new Date(u.userdata.last_hugs[theiremail])) >= (config.hug_timeout_seconds * 1000)))) {
        res.send("You can only hug a given person once every " + config.hug_timeout_english);
        return;
    }
    var ts = timestamp();
    u.userdata.last_hugs[theiremail] = ts;
    u.userdata.hugs.push({
        to: data.hashes[req.params.hash],
        date: ts
    });
    data.users[data.hashes[req.params.hash]].hugs.push({
        from: u.email,
        date: ts
    });
    data.num_hugs++;
    saveData();
    recalculateLeaderboard();
    res.redirect('/user/' + req.params.hash);
});

app.post('/changenick', function(req, res) {
    var u = getSessionData(req);
    var viewdata = u.viewdata;
    if (!u.loggedin) {
        res.send("You need to be logged in to change your nick");
        return;
    }
    if (req.body.nick.length < 1 || req.body.nick.length > 18) {
        res.send("Your nickname must be between 1 and 18 Unicode codepoints long");
        return;
    }
    u.userdata.nick = req.body.nick;
    saveData();
    recalculateLeaderboard();
    res.redirect('/');
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
                    created: timestamp(),
                    last_hugs: {}
                };
                data.hashes[hashEmail(email)] = email;
                data.num_users++;
                data.last_user = email;
                saveData();
            }
            var sessionkey = randomB36();
            sessions[sessionkey] = email;
            res.cookie('session', sessionkey, { signed: true, maxAge: 3600*24*30*1000 });
            res.redirect('/');
        }
    });
});

app.get('/logout', function (req, res) {
    if (sessions.hasOwnProperty(req.signedCookies.session)) {
        delete sessions[req.signedCookies.session];
    }
    res.clearCookie('session', { signed: true });
    res.redirect('/');
});

app.use("/media", express.static(__dirname + '/media'));

app.listen(config.port);

recalculateLeaderboard();
