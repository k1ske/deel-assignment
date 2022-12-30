process.env['NODE_ENV'] = 'test'

const app = require('./app')
const request = require('supertest')
const { CONTRACT_STATUSES } = require('./models/Contract')

beforeAll(async () => {
  await require('../scripts/seedDb')
})

afterAll(async () => {
  await Promise.all(
    Object.values(app.get('models')).map(async (model) =>
      model.destroy({
        where: {},
        truncate: true
      })
    )
  )
})

describe('running routes tests', () => {
  describe('testing contracts routes', () => {
    describe('/contracts', () => {
      it('should return 401 Unauthorized', async () => {
        const response = await request(app).get('/contracts')

        expect(response.statusCode).toBe(401)
      })

      it('should return list of client non terminated contracts', async () => {
        const profileId = 1
        const response = await request(app)
          .get('/contracts')
          .set('profile_id', profileId)

        expect(response.statusCode).toBe(200)
        expect(response.body.length).not.toEqual(0)
        response.body.forEach((contract) => {
          expect(contract.status).not.toEqual(CONTRACT_STATUSES.TERMINATED)
          expect(contract.ClientId).toEqual(profileId)
        })
      })

      it('should return list of contractor non terminated contracts', async () => {
        const profileId = 6
        const response = await request(app)
          .get('/contracts')
          .set('profile_id', profileId)

        expect(response.statusCode).toBe(200)
        expect(response.body.length).not.toEqual(0)
        response.body.forEach((contract) => {
          expect(contract.status).not.toEqual(CONTRACT_STATUSES.TERMINATED)
          expect(contract.ContractorId).toEqual(profileId)
        })
      })
    })

    describe('/contracts/:id', () => {
      it('should return 401 Unauthorized', async () => {
        const response = await request(app).get('/contracts/1')

        expect(response.statusCode).toBe(401)
      })

      it('should return the contract of the user', async () => {
        const profileId = 1
        const contractId = 1
        const response = await request(app)
          .get(`/contracts/${contractId}`)
          .set('profile_id', profileId)

        expect(response.statusCode).toBe(200)
        expect(response.body.id).toBe(contractId)
        expect(response.body.ClientId).toBe(profileId)
      })
    })
  })

  describe('testing jobs routes', () => {
    describe('/jobs/unpaid', () => {
      it('should return 401 Unauthorized', async () => {
        const response = await request(app).get('/jobs/unpaid')

        expect(response.statusCode).toBe(401)
      })

      it('should the list of unpaid jobs of the user', async () => {
        const profileId = 1
        const response = await request(app)
          .get('/jobs/unpaid')
          .set('profile_id', profileId)

        expect(response.statusCode).toBe(200)
        expect(response.body.length).not.toBe(0)
      })
    })
  })

  describe('testing jobs routes', () => {
    describe('/jobs/:job_id/pay', () => {
      it('should return 401 Unauthorized', async () => {
        const response = await request(app).post('/jobs/1/pay')

        expect(response.statusCode).toBe(401)
      })

      it('should return 403 Forbidden', async () => {
        const profileId = 5
        const response = await request(app)
          .post(`/jobs/1/pay`)
          .set('profile_id', profileId)

        expect(response.statusCode).toBe(403)
      })

      it('should return 404 Not found', async () => {
        const profileId = 1
        const jobId = 5
        const response = await request(app)
          .post(`/jobs/${jobId}/pay`)
          .set('profile_id', profileId)

        expect(response.statusCode).toBe(404)
      })

      it('should return 422 due job already paid', async () => {
        const profileId = 4
        const jobId = 6
        const response = await request(app)
          .post(`/jobs/${jobId}/pay`)
          .set('profile_id', profileId)

        expect(response.statusCode).toBe(422)
        expect(response.body.message).toBe('You already pay for this job')
      })

      it('should return 422 due not enough balance', async () => {
        const profileId = 4
        const jobId = 5
        const response = await request(app)
          .post(`/jobs/${jobId}/pay`)
          .set('profile_id', profileId)

        expect(response.statusCode).toBe(422)
        expect(response.body.message).toBe('You dont have enough balance')
      })

      it('should submit payment for the balance of the contractor, discount from balance of client and flag job as paid', async () => {
        const profileId = 1
        const jobId = 2
        const { Job, Contract, Profile } = app.get('models')

        const getJob = () =>
          Job.findByPk(jobId, {
            include: [
              {
                model: Contract,
                as: 'Contract',
                attributes: ['ContractorId'],
                include: [
                  {
                    model: Profile,
                    as: 'Contractor',
                  },
                  {
                    model: Profile,
                    as: 'Client',
                  },
                ],
              },
            ],
          })

        const job = await getJob()

        const response = await request(app)
          .post(`/jobs/${jobId}/pay`)
          .set('profile_id', profileId)

        const jobPost = await getJob()

        expect(response.statusCode).toBe(204)
        expect(jobPost.paid).toBe(true)
        expect(jobPost.Contract.Contractor.balance).toBe(job.Contract.Contractor.balance + job.price)
        expect(jobPost.Contract.Client.balance).toBe(job.Contract.Client.balance - job.price)
      })
    })
  })

  describe('testing balances routes', () => {
    describe('balances/deposit/:id', () => {
      it('should return 422 due invalid value', async () => {
        const profileId = 2
        const response = await request(app)
          .post(`/balances/deposit/${profileId}`)
          .send({
            amount: -1
          })

        expect(response.statusCode).toBe(422)
        expect(response.body.message).toBe('Invalid deposit value')
      })

      it('should return 422 due trying to deposit in a non client account', async () => {
        const profileId = 7
        const response = await request(app)
          .post(`/balances/deposit/${profileId}`)
          .send({
            amount: 1
          })

        expect(response.statusCode).toBe(422)
        expect(response.body.message).toBe('User is not a client')
      })

      it('should return 422 due trying to deposit amount that will result a balance greater than 25% of total jobs with pending payment', async () => {
        const profileId = 4
        const amount = 1000
        const response = await request(app)
          .post(`/balances/deposit/${profileId}`)
          .send({
            amount
          })

        expect(response.statusCode).toBe(422)
        expect(response.body.message).toBe('Your balance can\'t be greater than 25% of your total of jobs to pay')
      })

      it('should deposit to client balance', async () => {
        const profileId = 4
        const amount = 100
        const { Profile } = app.get('models')
        const getClient = () => Profile.findByPk(profileId)
        const client = await getClient()

        const response = await request(app)
          .post(`/balances/deposit/${profileId}`)
          .send({
            amount
          })

        const clientPost = await getClient()

        expect(response.statusCode).toBe(204)
        expect(clientPost.balance).toBe(client.balance + amount)
      })
    })
  })

  describe('testing admin routes', () => {
    describe('/admin/best-profession', () => {
      it('should return 422 due invalid date range', async () => {
        const response = await request(app)
          .get('/admin/best-profession')

        expect(response.statusCode).toBe(400)
        expect(response.body.message).toBe('Invalid date range')
      })

      it('should return empty results', async () => {
        const _1dayMs = 86400000
        const _1YearMs = _1dayMs * 365
        const start = new Date(Date.now() - _1YearMs).toISOString()
        const end = new Date(Date.now() - _1YearMs + _1dayMs).toISOString()

        const response = await request(app)
          .get('/admin/best-profession')
          .query({ start, end })

        expect(response.statusCode).toBe(200)
        expect(response.body).toBe(null)
      })

      it('should return the contractor with best profit', async () => {
        const _1dayMs = 86400000
        const start = new Date(Date.now() - _1dayMs).toISOString()
        const end = new Date(Date.now() + _1dayMs).toISOString()

        const response = await request(app)
          .get('/admin/best-profession')
          .query({ start, end })

        expect(response.statusCode).toBe(200)
        expect(response.body).not.toBe(null)
      })

      it('should return 422 due invalid date range', async () => {
        const response = await request(app)
          .get('/admin/best-clients')

        expect(response.statusCode).toBe(400)
        expect(response.body.message).toBe('Invalid date range')
      })

      it('should return empty results', async () => {
        const _1dayMs = 86400000
        const _1YearMs = _1dayMs * 365
        const start = new Date(Date.now() - _1YearMs).toISOString()
        const end = new Date(Date.now() - _1YearMs + _1dayMs).toISOString()

        const response = await request(app)
          .get('/admin/best-clients')
          .query({ start, end })

        expect(response.statusCode).toBe(200)
        expect(response.body.length).toBe(0)
      })

      it('should return the client that paid most', async () => {
        const _1dayMs = 86400000
        const start = new Date(Date.now() - _1dayMs).toISOString()
        const end = new Date(Date.now() + _1dayMs).toISOString()

        const response = await request(app)
          .get('/admin/best-clients')
          .query({ start, end })

        expect(response.statusCode).toBe(200)
        expect(response.body.length).not.toBe(0)
      })
    })
  })
})
