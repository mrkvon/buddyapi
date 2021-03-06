'use strict';

const validate = require('./validate');

const patchActive = validate('users/patchActive', [['params.username', 'body.id']]),
      patchAvailable = validate('users/patchAvailable', [['params.username', 'body.id']]),
      post = validate('users/post');

module.exports = { patchActive, patchAvailable, post };
