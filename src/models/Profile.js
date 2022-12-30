const Sequelize = require('sequelize')
const sequelize = require('../sequelize')

const PROFILE_TYPES = {
  CLIENT: 'client',
  CONTRACTOR: 'contractor',
}
class Profile extends Sequelize.Model {
}

Profile.init(
  {
    firstName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    lastName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    profession: {
      type: Sequelize.STRING,
      allowNull: false
    },
    balance: {
      type: Sequelize.DECIMAL(12, 2)
    },
    type: {
      type: Sequelize.ENUM(...Object.values(PROFILE_TYPES))
    }
  },
  {
    sequelize,
    modelName: 'Profile'
  }
)

const bootRelationships = () => {
  Profile.hasMany(sequelize.models.Contract, { as: 'Contractor', foreignKey: 'ContractorId' })
  Profile.hasMany(sequelize.models.Contract, { as: 'Client', foreignKey: 'ClientId' })
}

module.exports = {
  Profile,
  PROFILE_TYPES,
  bootRelationships,
}