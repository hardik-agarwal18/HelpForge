export const validate = (schema) => {
  return (req, res, next) => {
    try {
      const validatedData = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });

      // Optional but powerful: overwrite req with validated data
      req.body = validatedData.body || {};
      req.params = validatedData.params || {};
      req.query = validatedData.query || {};

      next();
    } catch (error) {
      const errors = error.errors?.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      })) || [
        { field: "unknown", message: error.message || "Validation failed" },
      ];

      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }
  };
};
