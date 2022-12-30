const Contract = require('./Contract')
const Profile = require('./Profile')
const Job = require('./Job')

bootRelationships()
function bootRelationships () {
  [Contract, Profile, Job].forEach((modelExports) => {
    const { bootRelationships } = modelExports

    bootRelationships && bootRelationships()
  })
}

module.exports = {
  ...Contract,
  ...Profile,
  ...Job,
}
