const documentModel = require('../models/documentModel');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

exports.getMyInvitations = catchAsync(async (req, res, next) => {
  const inviteeId = req.user.id;

  const invitations = await documentModel.getInvitationsForUser(inviteeId);

  res.status(200).json({
    status: 'success',
    results: invitations.length,
    data: {
      invitations,
    },
  });
});

exports.acceptInvitation = catchAsync(async (req, res, next) => {
  const invitationId = req.params.id;
  const userId = req.user.id;

  await documentModel.acceptInvitation(invitationId, userId);

  res.status(200).json({
    status: 'success',
    message: 'Invitation accepted. You now have access to the document.',
  });
});



exports.declineInvitation = catchAsync(async (req, res, next) => {
  const invitationId = req.params.id;
  const userId = req.user.id;

  const result = await documentModel.declineInvitation(invitationId, userId);

  if (result.affectedRows === 0) {
    return next(new AppError('Invitation not found, already acted upon, or you are not the invitee.', 404));
  }

  res.status(200).json({
    status: 'success',
    message: 'Invitation declined.',
  });
});