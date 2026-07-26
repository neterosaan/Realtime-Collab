const express = require('express');
const authController = require('../controllers/authController');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login/signup requests per window
  message: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username: { type: string, example: alice }
 *               email: { type: string, example: alice@test.com }
 *               password: { type: string, example: password123 }
 *     responses:
 *       201:
 *         description: User created, access token returned, refresh token set as httpOnly cookie
 *       400:
 *         description: Missing required field
 *       409:
 *         description: Email already registered
 */
router.post('/register', authLimiter, authController.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in with email and password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: alice@test.com }
 *               password: { type: string, example: password123 }
 *     responses:
 *       200:
 *         description: Access token returned, refresh token set as httpOnly cookie
 *       401:
 *         description: Invalid email or password (generic message either way -- no user enumeration)
 */
router.post('/login', authLimiter, authController.login);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get the currently authenticated user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Current user
 *       401:
 *         description: Missing, invalid, or expired token
 */
router.get('/me', authController.protect, authController.getMe);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Get a new access token using the refresh token cookie
 *     tags: [Auth]
 *     security: []
 *     description: Requires the httpOnly refreshToken cookie set by register/login -- not a bearer token.
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: No refresh cookie, or refresh token invalid/expired
 */
router.post('/refresh', authController.refreshToken);

module.exports = router;
