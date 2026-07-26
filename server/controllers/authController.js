const bcrypt = require('bcryptjs');
const Jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { promisify } = require('util');
const crypto = require('crypto');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const db = require('../db/mysql');
const documentModel = require('../models/documentModel');

const signToken = (id) => {
  return Jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const createAndStoreRefreshToken = async (userId) => {
  const refreshToken = crypto.randomBytes(32).toString('hex');

  const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const expiresInDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS, 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const [rows] = await db.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, hashedToken, expiresAt]
  );

  return refreshToken;
};

const createSendTokens = async (user, statusCode, res) => {
  const accessToken = signToken(user.id);
  const refreshToken = await createAndStoreRefreshToken(user.id);

  const expiresInDays = parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS, 10);
  const cookieOptions = {
    expires: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
    secure: process.env.NODE_ENV === 'production',
  };

  res.cookie('refreshToken', refreshToken, cookieOptions);

  user.password_hash = undefined;

  res.status(statusCode).json({
    status: 'success',
    accessToken,
    data: {
      user,
    },
  });
};

exports.refreshToken = catchAsync(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return next(new AppError('No refresh token found. Please log in again.', 401));
  }

  const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');

  const [rows] = await db.execute(
    `select * from refresh_tokens where token_hash =? AND expires_at > NOW()`,
    [hashedToken]
  );

  const tokenData = rows[0];

  if (!tokenData) {
    res.cookie('refreshToken', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000), //expire in 10 seconds
      httpOnly: true,
    });
    return next(new AppError('Invalid or expired refresh token. Please log in again.', 401));
  }

  const userSql = 'SELECT * FROM users WHERE id = ?';
  const [userRows] = await db.execute(userSql, [tokenData.user_id]);
  const user = userRows[0];

  if (!user) {
    return next(new AppError('User belonging to this token not found.', 401));
  }

  const newAccessToken = signToken(user.id);

  res.status(200).json({
    status: 'success',
    accessToken: newAccessToken,
  });
});

exports.register = catchAsync(async (req, res, next) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return next(new AppError('Please provide username, email, and password.', 400));
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const userId = uuidv4();

  const newUser = {
    id: userId,
    username,
    email,
    password_hash: hashedPassword,
  };

  const sql = `INSERT INTO users(id,username,email,password_hash) VALUES (?,?,?,?)`;
  const values = [newUser.id, newUser.username, newUser.email, newUser.password_hash];

  await db.execute(sql, values);

  createSendTokens(newUser, 201, res);
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const [rows] = await db.execute(`SELECT * FROM users WHERE email=?`, [email]);

  if (rows.length === 0) {
    return next(new AppError('Invalid email or password', 401));
  }

  const user = rows[0];

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return next(new AppError('Invalid email or password', 401));
  }

  createSendTokens(user, 200, res);
});

exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('You are not logged in! please log in to get acess', 401));
  }
  const decoded = await promisify(Jwt.verify)(token, process.env.JWT_SECRET);

  const [rows] = await db.execute(`select * from users where id=?`, [decoded.id]);

  const currentUser = rows[0];

  if (!currentUser) {
    return next(new AppError('The user belonging to this token does no longer exist.', 401));
  }

  req.user = currentUser;
  next();
});

exports.getMe = catchAsync(async (req, res, next) => {
  req.user.password_hash = undefined;

  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
});

exports.isOwner = catchAsync(async (req, res, next) => {
  const documentId = req.params.id;
  const requestingUserId = req.user.id;

  const ownerId = await documentModel.findOwner(documentId);

  if (!ownerId || ownerId !== requestingUserId) {
    return next(
      new AppError('You are not the owner of this document, you cannot perform this action.', 403)
    );
  }

  next();
});
