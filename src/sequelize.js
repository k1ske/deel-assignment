const Sequelize = require('sequelize')

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: `./database${process.env.NODE_ENV === 'test' ? '.test' : ''}.sqlite3`,
  logging: process.env.NODE_ENV !== 'test'
})

module.exports = sequelize