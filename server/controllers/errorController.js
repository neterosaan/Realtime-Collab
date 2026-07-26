const AppError = require('../utils/appError');


const handleDuplicateFieldsDB = (err) => {

    const value = err.sqlMessage.match(/(["'])(\\?.)*?\1/)[0];
    const message = `Duplicate field value: ${value}. An account with this value already exists.`;
    return new AppError(message, 409); 
};

const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401);


const handleJWTExpiredError = () => new AppError('Your token has expired! Please log in again.', 401);


const sendErrorDev = (err, res) => {
    return res.status(err.statusCode).json({
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack
    });
};


const sendErrorProd = (err, res) => {
    if (err.isOperational) {
        return res.status(err.statusCode).json({
            status: err.status,
            message: err.message
        });
    }
    

    console.error('ERROR 💥', err);
    return res.status(500).json({
        status: 'error',
        message: 'Something went very wrong!'
    });
};


module.exports = (err, req, res, next) => {
        console.log('--- GLOBAL ERROR HANDLER TRIGGERED ---'); 

    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, res);
    } else  {

        let error = { ...err };
        error.name = err.name; 
        error.message = err.message; 
        error.code = err.code; 
        error.sqlMessage = err.sqlMessage; 

        if (error.code === 'ER_DUP_ENTRY') error = handleDuplicateFieldsDB(error);
        if (error.name === 'JsonWebTokenError') error = handleJWTError();
        if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
        
        sendErrorProd(error, res);
    }
};