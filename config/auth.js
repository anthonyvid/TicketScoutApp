module.exports = {
	ensureAuthenticated: function (req, res, next) {
		if (req.isAuthenticated()) {
			return next();
		}
		req.flash("invalid_auth", "Please log in to view this resource");
		res.redirect("/");
	},

	checkNotAuthenticated(req, res, next) {
		if (req.isAuthenticated()) {
			return res.redirect("/dashboard");
		}
		next();
	},
};
