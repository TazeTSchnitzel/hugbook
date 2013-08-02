(function () {
    'use strict';

    window.onload = function () {
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

        if (hugbook.loggedIn) {
            document.getElementById('logoutbtn').onclick = function () {
                navigator.id.logout();
            };
        } else if (window.location.pathname === '/') {
            document.getElementById('signbtn').onclick = function () {
                navigator.id.request();
            };
        }
    };
}());
