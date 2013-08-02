(function () {
    'use strict';

    function doPersona() {
        navigator.id.watch({
            loggedInUser: hugbook.loggedIn,
            onlogin: function (assertion) {
                var form, asserthidden;
                form = document.createElement('form');
                form.action = '/login';
                form.method = 'post';
                asserthidden = document.createElement('input');
                asserthidden.type = 'hidden';
                asserthidden.name = 'assertion';
                asserthidden.value = assertion;
                form.appendChild(asserthidden);
                document.body.appendChild(form);
                form.submit();
            },
            onlogout: function () {
                window.location = '/logout';
            }
        });
    }

    window.onload = function () {
        if (hugbook.loggedIn) {
            document.getElementById('logoutbtn').onclick = function () {
                doPersona();
                navigator.id.logout();
            };
        } else if (window.location.pathname === '/') {
            document.getElementById('signbtn').onclick = function () {
                doPersona();
                navigator.id.request();
            };
        }
    };
}());
