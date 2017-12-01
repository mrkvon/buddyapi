'use strict';

const jwt = require('jsonwebtoken'),
      path = require('path'),
      should = require('should'),
      sinon = require('sinon');

const agentFactory = require('./agent'),
      config = require(path.resolve('./config')),
      db = require('./db');

describe('authentication', () => {
  let agent,
      dbData,
      sandbox,
      unverifiedAdmin,
      unverifiedUser,
      verifiedAdmin,
      verifiedUser;

  beforeEach(() => {
    agent = agentFactory();
  });

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    sandbox.useFakeTimers({
      now: 1500000000000,
      toFake: ['Date']
    });

    sandbox.stub(config.jwt, 'expirationTime').value(1000);
    sandbox.stub(config.jwt, 'adminExpirationTime').value(500);
    sandbox.stub(config.jwt, 'secret').value('asdf');
  });

  afterEach(() => {
    sandbox.restore();
  });

  // fill database with some data
  beforeEach(async () => {
    dbData = await db.fill({
      users: 4,
      details: [
        { role: 'buddy', active: true },
        { role: 'comer' },
        { role: 'buddy', active: false }
      ],
      verifiedUsers: [0, 2],
      admins: [2, 3]
    });

    [verifiedUser, unverifiedUser , verifiedAdmin, unverifiedAdmin] = dbData.users;
  });

  describe('GET /auth/token', () => {
    context('valid request', () => {

      it('[verified user] respond with 200 and valid jwt token', async () => {
        const response = await agent
          .get('/auth/token')
          .auth(verifiedUser.username, verifiedUser.password)
          .expect(200);

        // check token (generated by jwt.io)
        const { token } = response.body.meta;
        should(token).eql('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InVzZXIwIiwidmVyaWZpZWQiOnRydWUsInJvbGUiOiJidWRkeSIsImFjdGl2ZSI6dHJ1ZSwiaWF0IjoxNTAwMDAwMDAwLCJleHAiOjE1MDAwMDEwMDB9.PBfSr-OZV_FBKpk_UrZ49PgSZ5_jGHBOMErjM6mbvl4');

        // check payload
        const payload = jwt.decode(token);
        should(payload).deepEqual({
          username: verifiedUser.username,
          verified: true,
          role: 'buddy',
          active: true,
          iat: 1500000000,
          exp: 1500001000
        });
      });

      it('[unverified user] respond with 200 and valid jwt token', async () => {
        const response = await agent
          .get('/auth/token')
          .auth(unverifiedUser.username, unverifiedUser.password)
          .expect(200);

        // check token (generated by jwt.io)
        const { token } = response.body.meta;
        should(token).eql('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InVzZXIxIiwidmVyaWZpZWQiOmZhbHNlLCJyb2xlIjoiY29tZXIiLCJpYXQiOjE1MDAwMDAwMDAsImV4cCI6MTUwMDAwMTAwMH0.5LzUs4GwUh6uytnFMe7uQHnxzr9gZF7HD1aHxRu9050');

        // check payload
        const payload = jwt.decode(token);
        should(payload).deepEqual({
          username: unverifiedUser.username,
          verified: false,
          role: 'comer',
          iat: 1500000000,
          exp: 1500001000
        });

      });

    });

    context('invalid request', invalidRequestTests(false));

  });

  /**
   * Factory for invalid request tests, common for /auth/token and /auth/token/admin
   */
  function invalidRequestTests(isAdmin = false) {
    const url = (isAdmin) ? '/auth/token/admin': '/auth/token';

    let verified; // verified user or admin

    beforeEach(() => {
      verified = (isAdmin) ? verifiedAdmin : verifiedUser;
    });

    return () => {
      it('[incorrect password] 401 invalid credentials', async () => {
        const response = await agent
          .get(url)
          .auth(verified.username, 'incorrectPassword')
          .expect(401);

        should(response.body).have.property('errors').deepEqual([
          { title: 'Not Authorized', detail: 'invalid credentials' }
        ]);
      });

      it('[nonexistent username] 401 invalid credentials', async () => {
        const response = await agent
          .get(url)
          .auth('nonexistent-user', 'xiy1A.0n.;SxXio')
          .expect(401);

        should(response.body).have.property('errors').deepEqual([
          { title: 'Not Authorized', detail: 'invalid credentials' }
        ]);
      });

      it('[missing authorization header] 401 missing credentials', async () => {
        const response = await agent
          .get(url)
          .expect(401);

        should(response.body).have.property('errors').deepEqual([
          { title: 'Not Authorized', detail: 'invalid or missing Authorization header' }
        ]);
      });

      it('[not Basic authorization header] 401 ', async () => {
        const response = await agent
          .get(url)
          .set('Authorization', 'Bearer aaaa.bbbb.cccc')
          .expect(401);

        should(response.body).have.property('errors').deepEqual([
          { title: 'Not Authorized', detail: 'invalid or missing Authorization header' }
        ]);
      });

    };
  }

  describe('GET /auth/token/admin', () => {

    context('valid request', () => {
      it('[admin with verified email] 200 and valid jwt admin token', async () => {
        // admin token has smaller expiration time
        // and admin: true in payload
        const response = await agent
          .get('/auth/token/admin')
          .auth(verifiedAdmin.username, verifiedAdmin.password)
          .expect(200);

        // check token (generated by jwt.io)
        const { token } = response.body.meta;

        // check payload
        const payload = jwt.decode(token);
        should(payload).deepEqual({
          username: verifiedAdmin.username,
          verified: true,
          role: 'buddy',
          active: false,
          admin: true, // admin: true
          iat: 1500000000,
          exp: 1500000500 // smaller expiration
        });

        // check token (generated with jwt.io)
        should(token).eql('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InVzZXIyIiwidmVyaWZpZWQiOnRydWUsInJvbGUiOiJidWRkeSIsImFjdGl2ZSI6ZmFsc2UsImFkbWluIjp0cnVlLCJpYXQiOjE1MDAwMDAwMDAsImV4cCI6MTUwMDAwMDUwMH0.aEMNiu5yK64tynaOScsG0P99ave3hiSVdEc1eSqY40I');

      });

      it('[admin with unverified email] 401 not verified', async () => {
        const response = await agent
          .get('/auth/token/admin')
          .auth(unverifiedAdmin.username, unverifiedAdmin.password)
          .expect(401);

        should(response.body).deepEqual({
          errors: [{ title: 'Not Authorized', detail: 'email not verified' }]
        });
      });

      it('[not admin] 401 not admin', async () => {
        const response = await agent
          .get('/auth/token/admin')
          .auth(verifiedUser.username, verifiedUser.password)
          .expect(401);

        should(response.body).deepEqual({
          errors: [{ title: 'Not Authorized', detail: 'not admin' }]
        });
      });

    });

    context('invalid request', invalidRequestTests(true));

  });
});

describe('authorization', () => {

});
