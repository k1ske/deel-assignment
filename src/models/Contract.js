const Sequelize = require('sequelize')
const sequelize = require('../sequelize')
const { Job } = require('./Job')

const CONTRACT_STATUSES = {
  NEW: 'new',
  IN_PROGRESS: 'in_progress',
  TERMINATED: 'terminated',
}
class Contract extends Sequelize.Model {
}

Contract.init(
  {
    terms: {
      type: Sequelize.TEXT,
      allowNull: false
    },
    status: {
      type: Sequelize.ENUM(...Object.values(CONTRACT_STATUSES))
    }
  },
  {
    sequelize,
    modelName: 'Contract'
  }
)

const bootRelationships = () => {
  Contract.belongsTo(sequelize.models.Profile, { as: 'Contractor' })
  Contract.belongsTo(sequelize.models.Profile, { as: 'Client' })
  Contract.hasMany(Job)
}

module.exports = {
  Contract,
  CONTRACT_STATUSES,
  bootRelationships,
}