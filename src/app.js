const express = require('express')
const bodyParser = require('body-parser')
const { Op } = require('sequelize')
const { getProfile } = require('./middleware/getProfile')
const sequelize = require('./sequelize')
require('./models')

const { CONTRACT_STATUSES } = require('./models/Contract')
const { PROFILE_TYPES } = require('./models/Profile')
const app = express()

app.use(bodyParser.json())
app.set('sequelize', sequelize)
app.set('models', sequelize.models)

app.get('/contracts/:id', getProfile, async (req, res) => {
  const { Contract } = req.app.get('models')
  const { id } = req.params
  const { id: ClientId } = req.profile.dataValues
  const contract = await Contract.findOne(
    {
      where: {
        id,
        ClientId,
      }
    })

  if (!contract) {
    return res.status(404).end()
  }

  return res.json(contract)
})

app.get('/contracts', getProfile, async (req, res) => {
  const { Contract } = req.app.get('models')
  const { id: ClientId } = req.profile.dataValues
  const { id: ContractorId } = req.profile.dataValues

  const contracts = await Contract.findAll(
    {
      where: {
        status: {
          [Op.ne]: CONTRACT_STATUSES.TERMINATED
        },
        [Op.or]: {
          ClientId,
          ContractorId,
        },
      }
    })

  return res.json(contracts)
})

app.get('/jobs/unpaid', getProfile, async (req, res) => {
  const { Job, Contract } = req.app.get('models')
  const { id: profileId } = req.profile.dataValues

  const job = await Job.findAll(
    {
      where: {
        paid: null,
        '$Contract.status$': CONTRACT_STATUSES.IN_PROGRESS,
        [Op.or]: {
          '$Contract.ContractorId$': profileId,
          '$Contract.ClientId$': profileId,
        },
      },
      include: [
        { model: Contract, as: 'Contract' }
      ]
    })

  if (!job) {
    return res.json([])
  }

  return res.json(job)
})

app.post('/jobs/:job_id/pay', getProfile, async (req, res) => {
  const { Job, Contract, Profile } = req.app.get('models')
  const { job_id } = req.params
  const { profile } = req

  if (profile.type !== PROFILE_TYPES.CLIENT) {
    return res.status(403).end()
  }

  const { id: ClientId } = req.profile.dataValues

  const job = await Job.findByPk(job_id,
    {
      include: [
        {
          model: Contract,
          as: 'Contract',
          required: true,
          where: {
            ClientId,
          },
          include: [
            {
              model: Profile,
              as: 'Contractor',
            },
          ]
        },
      ]
    })

  if (!job) {
    return res.status(404).end()
  }

  if (job.paid) {
    return res.status(422).json({
      message: 'You already pay for this job'
    })
  }

  if (profile.balance < job.price) {
    return res.status(422).json({
      message: 'You dont have enough balance'
    })
  }

  const transaction = await sequelize.transaction()

  profile.balance -= job.price
  await profile.save({
    transaction
  })

  job.Contract.Contractor.balance += job.price
  await job.Contract.Contractor.save({
    transaction
  })

  job.paid = true
  job.paymentDate = new Date
  await job.save({
    transaction
  })

  await transaction.commit()

  return res.status(204).end()
})

app.post('/balances/deposit/:userId', async (req, res) => {
  const { Profile, Contract, Job } = req.app.get('models')
  const { userId } = req.params
  const { amount: amountBuffer } = req.body

  if (isNaN(amountBuffer)) {
    return res.status(400).end()
  }

  const amount = parseFloat(amountBuffer)

  if (amount <= 0) {
    return res.status(422).json({
      message: 'Invalid deposit value'
    })
  }

  const client = await Profile.findByPk(userId, {
    include: [
      {
        model: Contract,
        as: 'Client',
        include: [
          {
            model: Job,
            as: 'Jobs',
            where: {
              paid: null
            }
          }
        ]
      },
    ]
  })

  if (client.type !== PROFILE_TYPES.CLIENT) {
    return res.status(422).json({
      message: 'User is not a client'
    })
  }

  const jobs = client.Client.map((contract) => contract.Jobs).flat()
  const pendingPaymentsSum = jobs.map((job) => job.price).reduce((stack, current) => stack + current)
  const maxBalanceAllowed = pendingPaymentsSum * 1.25
  const finalBalanceTarget = client.balance + amount

  if (finalBalanceTarget > maxBalanceAllowed) {
    return res.status(422).json({
      message: 'Your balance can\'t be greater than 25% of your total of jobs to pay'
    }).end()
  }

  client.balance = finalBalanceTarget
  await client.save()

  return res.status(204).end()
})

app.get('/admin/best-profession', async (req, res) => {
  const { Job, Contract, Profile } = req.app.get('models')
  const { start: startDateBuffer, end: endDateBuffer } = req.query
  const startDateTs = Date.parse(startDateBuffer)
  const endDateTs = Date.parse(endDateBuffer)

  if (isNaN(startDateTs) || isNaN(endDateTs) || startDateTs > endDateTs) {
    return res.status(400).json({
      message: 'Invalid date range'
    }).end()
  }

  const startDate = new Date(startDateTs)
  const endDate = new Date(endDateTs)

  const jobsJoint = await Job.findOne({
    where: {
      paid: true,
      createdAt: {
        [Op.between]: [startDate, endDate],
      },
    },
    attributes: [
      [sequelize.fn('sum', sequelize.col('price')), 'totalPaid'],
    ],
    include: [
      {
        model: Contract,
        as: 'Contract',
        attributes: ['ContractorId'],
        include: [
          {
            model: Profile,
            as: 'Contractor',
            required: true,
          },
        ],
        required: true,
      },
    ],
    order: [['totalPaid', 'desc']],
    group: sequelize.col('Contract->Contractor.id'),
  })

  if (!jobsJoint) {
    return res.json(null).end()
  }

  return res.json({
    ...jobsJoint.Contract.Contractor.dataValues,
    totalReceived: jobsJoint.dataValues.totalPaid,
  }).end()
})

app.get('/admin/best-clients', async (req, res) => {
  const { Job, Contract, Profile } = req.app.get('models')
  const { start: startDateBuffer, end: endDateBuffer } = req.query
  const startDateTs = Date.parse(startDateBuffer)
  const endDateTs = Date.parse(endDateBuffer)

  if (isNaN(startDateTs) || isNaN(endDateTs)) {
    return res.status(400).json({
      message: 'Invalid date range'
    }).end()
  }

  const startDate = new Date(startDateTs)
  const endDate = new Date(endDateTs)

  const jobsJoints = await Job.findAll({
    where: {
      paid: true,
      createdAt: {
        [Op.between]: [startDate, endDate],
      },
    },
    attributes: [
      [sequelize.fn('sum', sequelize.col('price')), 'totalPaid'],
    ],
    include: [
      {
        model: Contract,
        as: 'Contract',
        attributes: ['ClientId'],
        include: [
          {
            model: Profile,
            as: 'Client',
            required: true,
          },
        ],
        required: true,
      },
    ],
    order: [['totalPaid', 'desc']],
    group: 'Contract->Client.id',
    limit: 2,
  })

  if (!jobsJoints) {
    return res.json([]).end()
  }

  return res.json(
    jobsJoints.map(jobsJoint => (
      {
        ...jobsJoint.Contract.Client.dataValues,
        totalPaid: jobsJoint.dataValues.totalPaid
      }
    ))
  ).end()
})

module.exports = app
