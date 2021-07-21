const bcrypt = require("bcryptjs");
const validator = require("validator");
const usersCollection = require("../db").collection("users");
const storesCollection = require("../db").collection("stores");
const nodemailer = require("nodemailer");

class User {
	constructor(data) {
		this.data = data;
		this.errors = {};
	}

	hashPrivateInfo(info) {
		let salt = bcrypt.genSaltSync(10);
		const hashedData = bcrypt.hashSync(info, salt);
		return hashedData;
	}

	async sendEmail(msg) {
		let transporter = nodemailer.createTransport({
			service: "gmail",
			auth: {
				user: process.env.GMAILUSER, // generated ethereal user
				pass: process.env.GMAILPASS, // generated ethereal password
			},
		});

		const info = await transporter.sendMail(msg, (err, data) => {
			if (err) {
				console.log("error occured: ", err);
			} else {
				console.log("Email sent");
			}
		});
	}

	async forgotPassword(data) {
		//validate email
		if (!validator.isEmail(data.email))
			this.errors["email"] = "Not a valid email";

		if (Object.keys(this.errors).length > 0) {
			return this.errors;
		}

		const user = await usersCollection.findOne({
			email: data.email,
		});

		// if no user found
		if (!user) {
			return;
		} else {
			const msg = {
				to: `${data.email}`, // list of receivers
				subject: `Reset Your Password`, // Subject line
				html: {
					path: "./views/emailTemplates/recoverPasswordEmail.html",
				},
			};

			this.sendEmail(msg);

			return user;
		}
	}

	clearDatabase() {
		usersCollection.deleteMany({});
		storesCollection.deleteMany({});
	}

	cleanUp(data) {
		if (typeof data.fullname != "string") this.data.fullname = "";
		if (typeof data.email != "string") this.data.email = "";
		if (typeof data.password != "string") this.data.password = "";
		if (typeof data.passwordConfirm != "string")
			this.data.passwordConfirm = "";

		//If they are admin cleanup data like below
		if ("storename" in data) {
			console.log("in cleanUp: Admin");
			this.data = {
				fullname: data.fullname.toLowerCase(),
				email: data.email.trim().toLowerCase(),
				storename: data.storename.toLowerCase(),
				password: data.password,
				passwordConfirm: data.passwordConfirm,
			};
		}
		//If they are employee cleanup data like below
		else {
			console.log("in cleanUp: Employee");
			this.data = {
				fullname: data.fullname.toLowerCase(),
				email: data.email.trim().toLowerCase(),
				password: data.password,
				passwordConfirm: data.passwordConfirm,
				signUpCode: data.signUpCode,
			};
		}
	}

	async validate(data) {
		//validate full name
		if (!/\s/g.test(data.fullname))
			this.errors["fullname"] = "Not a valid name";

		//validate email
		if (!validator.isEmail(data.email))
			this.errors["email"] = "Not a valid email";

		//validate if email exists already
		const emailResult = await usersCollection.findOne({
			email: data.email,
		});
		if (emailResult) this.errors["email"] = "Email already registered";

		//validate if store exists already
		if ("storename" in data) {
			const storeResult = await storesCollection.findOne({
				storename: data.storename,
			});
			if (storeResult)
				this.errors["storename"] = "Store already registered";
		}

		//validate password
		if (data.password.length < 8)
			this.errors["password"] = "Password must be at least 8 characters";

		if (data.password.length > 50)
			this.errors["password"] = "Password cannot exceed 50 characters";

		//validate passwordConfirm
		if (data.passwordConfirm !== data.password)
			this.errors["passwordConfirm"] = "Passwords do not match";

		//NEED TO VALIDATE AND SEE IF STORE EVEN EXISTS WHEN EMPLOYEE ENTERS IN SIGNUPKEY
		if (!("storename" in data)) {
			const result = await storesCollection.findOne({
				signUpCode: data.signUpCode,
			});
			if (result == null)
				this.errors["storename"] = "Store you are joining not found";
		}
	}

	async login() {
		try {
			const result = await usersCollection.findOne({
				email: this.data.email.toLowerCase(),
			});

			if (
				result &&
				bcrypt.compareSync(this.data.password, result.password)
			) {
				console.log("valid login info");

				//if user success on login make conenction true
				this.changeUserConnection(result, true);
			} else {
				console.log("invalid login info");
				return;
			}
		} catch (err) {
			console.log(err);
		}
	}

	async logout() {
		console.log("in logout");
		//TODO: NEED TO GET USER IN REQ.BODY FROM ROUTEGARD INTO CONTROLLER EVEN THOUGH NOTHING IS SUBMITTED IN FORM

		try {
			const result = await usersCollection.findOne({
				email: this.data.email.toLowerCase(),
			});

			this.changeUserConnection(result, false);
		} catch (err) {
			console.log(err);
		}
	}

	async changeUserConnection(user, connection) {
		try {
			await usersCollection.updateOne(user, {
				$set: { connected: connection },
			});

			if (user.admin) {
				await storesCollection.updateOne(
					{
						storename: user.storename,
					},
					{ $set: { "admin.connected": connection } }
				);
			} else {
				const store = await storesCollection.findOne({
					storename: user.storename,
				});

				const employee = store.employees.findIndex(
					(employee) => employee.email === user.email
				);

				if (employee === -1) {
					console.log(
						"employee not found in store, but found in users collection, warning ***"
					);
				} else {
					await storesCollection.updateOne(
						{
							storename: user.storename,
						},
						{
							$set: {
								[`employees.${employee}.connected`]: connection,
							},
						}
					);
				}
			}
		} catch (err) {
			console.log(err);
		}
	}

	async employeeRegister() {
		this.cleanUp(this.data);
		await this.validate(this.data);

		//if there are any errors then stop and print errors
		if (this.errors.length) {
			console.log("errors", this.errors);
			return;
		}

		//hash user passwords
		this.data.password = this.hashPrivateInfo(this.data.password);
		this.data.passwordConfirm = this.data.password;

		const store = await storesCollection.findOne({
			signUpCode: this.data.signUpCode,
		});

		const employee = {
			fullname: this.data.fullname.toLowerCase(),
			email: this.data.email.toLowerCase(),
			storename: store.storename.toLowerCase(),
			password: this.data.password,
			passwordConfirm: this.data.passwordConfirm,
			connected: false,
			admin: false,
		};

		storesCollection.updateOne(
			{ signUpCode: this.data.signUpCode },
			{
				$push: {
					employees: employee,
				},
			}
		);

		//add user into users collection
		usersCollection.insertOne(employee);

		console.log("employee successfully joined store");
	}
}

module.exports = User;
