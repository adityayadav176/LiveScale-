
const errorMiddleware = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    const response = {
        success: false,
        message: err.message || "Internal Server Error",
        data: null,
        errors: err.errors || [],
    };

    // Include stack trace only in development
    if (process.env.NODE_ENV === "development") {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
};

export { errorMiddleware };
