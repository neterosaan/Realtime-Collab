const db = require('../db/mysql');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const documentModel = require('../models/documentModel');
const DocumentContent = require('../models/documentContentModel');

exports.createDocument = catchAsync(async (req, res, next) => {
  const { title } = req.body;
  const ownerId = req.user.id;

  const newDocument = await documentModel.create(title, ownerId);

  res.status(201).json({
    status: 'success',
    data: {
      document: newDocument,
    },
  });
});

exports.getAllDocuments = catchAsync(async (req, res, next) => {
  const userId = req.user.id;

  const documents = await documentModel.findAllForUser(userId);

  res.status(200).json({
    status: 'success',
    results: documents.length,
    data: {
      documents,
    },
  });
});

exports.getDocument = catchAsync(async (req, res, next) => {
  const documentId = req.params.id;
  const userId = req.user.id;

  const document = await documentModel.findById(documentId, userId);

  if (!document) {
    return next(new AppError('No document found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      document,
    },
  });
});

exports.updateDocument = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const documentId = req.params.id;
  const { title } = req.body;

  if (!title) {
    return next(new AppError('Title is required for an update.', 400));
  }

  await documentModel.updateTitle(documentId, title);

  const updatedDocument = await documentModel.findById(documentId, userId);

  res.status(200).json({
    status: 'success',
    data: {
      document: updatedDocument,
    },
  });
});

exports.deleteDocument = catchAsync(async (req, res, next) => {
  const documentId = req.params.id;

  await documentModel.remove(documentId);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.shareDocument = catchAsync(async (req, res, next) => {
  const documentId = req.params.id;
  const { email } = req.body;
  const inviterId = req.user.id;

  if (!email) {
    return next(new AppError('Please provide an email  to share.', 400));
  }
  const [roles] = await db.execute('SELECT id FROM roles WHERE name = ?', ['editor']);
  const editorRole = roles[0];
  if (!editorRole) {
    return next(new AppError('Server configuration error: "editor" role not found.', 500));
  }
  const editorRoleId = editorRole.id;

  const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
  const userToInvite = users[0];

  if (!userToInvite) {
    return next(new AppError('No user found with that email address.', 404));
  }

  if (userToInvite.id === inviterId) {
    return next(new AppError('You cannot share a document with yourself.', 400));
  }

  const invitation = await documentModel.createInvitation(
    documentId,
    inviterId,
    userToInvite.id,
    editorRoleId
  );

  res.status(201).json({
    status: 'success',
    message: `Document successfully shared with ${userToInvite.username}.`,
    data: {
      invitation,
    },
  });
});

exports.getPermissions = catchAsync(async (req, res, next) => {
  const documentId = req.params.id;

  const permissions = await documentModel.getPermissions(documentId);

  res.status(200).json({
    status: 'success',
    results: permissions.length,
    data: {
      permissions,
    },
  });
});

exports.removePermission = catchAsync(async (req, res, next) => {
  const documentId = req.params.id;
  const { userIdToRemove } = req.body;

  if (!userIdToRemove) {
    return next(new AppError('Please provide the userId of the user to remove.', 400));
  }

  if (userIdToRemove === req.user.id) {
    return next(new AppError('The owner cannot remove their own access.', 400));
  }

  const result = await documentModel.removePermission(documentId, userIdToRemove);

  if (result.affectedRows === 0) {
    return next(new AppError('No permission found for this user on this document.', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.setPublicStatus = catchAsync(async (req, res, next) => {
  const documentId = req.params.id;
  const { is_public } = req.body;

  if (typeof is_public !== 'boolean') {
    return next(new AppError('Please provide a boolean value for is_public.', 400));
  }

  await documentModel.setPublicStatus(documentId, is_public);

  res.status(200).json({
    status: 'success',
    message: `Document public status set to ${is_public}.`,
  });
});

exports.viewPublicDocument = catchAsync(async (req, res, next) => {
  const documentId = req.params.id;
  const userId = req.user.id;

  const isPublic = await documentModel.isPublic(documentId);
  if (!isPublic) {
    return next(new AppError('This document is not public or does not exist.', 404));
  }

  const hasAccess = await documentModel.findById(documentId, userId);

  if (hasAccess) {
    return res.status(200).json({
      status: 'success',
      message: 'You already have access to this document.',
    });
  }

  const [roles] = await db.execute('SELECT id FROM roles WHERE name = ?', ['viewer']);
  const viewerRole = roles[0];
  if (!viewerRole) {
    return next(new AppError('Server configuration error: "viewer" role not found.', 500));
  }

  try {
    await documentModel.addPermission(documentId, userId, viewerRole.id);
  } catch (error) {
    if (error.statusCode !== 409) {
      throw error;
    }
  }

  res.status(201).json({
    status: 'success',
    message: 'You have been granted view access to this document.',
  });
});
