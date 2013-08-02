What's hugbook
==============

facebook except with hugs

Setup
-----

Make a `config.json` file in `/server`:

    {
        "cookie_secret": "(secret guarding cookies here)",
        "email_secret": "(secret used to salt email hash here)",
        "origin": "http://localhost:8000",
        "port": 8000,
        "hug_timeout_english": "minute",
        "hug_timeout_seconds": 60
    }
