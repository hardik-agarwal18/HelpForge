export const validate = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      // Handle Zod validation errors
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
