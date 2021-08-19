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
				user: process.env.GMAILUSER,
				pass: process.env.GMAILPASS,
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

	async updateAccountInfo(oldEmail, newInfo) {
		console.log(newInfo);
		let { firstname, lastname, email } = newInfo;

		//validate email
		if (!validator.isEmail(email))
			return { emailError: "Not a valid email" };

		if (firstname.length == 0 || lastname.length == 0)
			return { emailError: "Invalid firstname or lastname" };

		const fullname =
			firstname.trim().toLowerCase() +
			" " +
			lastname.trim().toLowerCase();

		email = email.trim().toLowerCase();

		//update db
		await usersCollection.updateOne(
			{ email: oldEmail },
			{
				$set: {
					["fullname"]: fullname,
					["email"]: email,
				},
			}
		);

		return {};
	}

	async getPaymentSettings(storename) {
		const store = await storesCollection.findOne({ storename: storename });
		return store.storeSettings.payments;
	}

	async createNewpayment(formData, storename) {
		const customer = JSON.parse(formData.customer);
		const order = JSON.parse(formData.order);
		const paymentMethod = formData.payment;
		const orderTotal = formData.orderTotal;
		const linkedTicket = formData.linkedTicket;

		console.log(linkedTicket);

		const store = await storesCollection.findOne({ storename: storename });

		//if there is a number validate it
		if (customer.phone.length > 0) {
			if (!this.isValidPhone(customer.phone))
				return { phoneError: "Invalid Phone Number" };

			//see if that number is in store
			if (
				!Object.keys(store.storedata.customers).includes(
					customer.phone.trim()
				)
			)
				return { phoneError: "Phone number not registered" };
		}

		let mostRecentPaymentID;

		//see if any previous payments are in store, if not start at 99
		if (Object.keys(store.storedata.payments).length == 0) {
			mostRecentPaymentID = 99;
		} else {
			//gert most recent number
			mostRecentPaymentID =
				Math.max(
					...Object.keys(store.storedata.payments).map((i) =>
						parseInt(i)
					)
				) + 1;
		}

		console.log(mostRecentPaymentID);

		const payment = {
			customer: {
				firstname: customer.firstname,
				lastname: customer.lastname,
				phone: customer.phone,
				email: customer.email,
			},
			orderTotal: orderTotal,
			orderItems: order,
			paymentMethod: paymentMethod,
			linkedTicket: linkedTicket,
			status: "approved",
			date: new Date().toDateString(),
		};

		if (customer.phone.length > 0) {
			console.log("yaa");
			await storesCollection.updateOne(
				{ storename: storename },
				{
					$set: {
						[`storedata.customers.${[customer.phone]}.payments.${[
							mostRecentPaymentID,
						]}`]: payment,
					},
				}
			);
		}

		if (linkedTicket.length > 3) {
			console.log("yada");
			await storesCollection.updateOne(
				{ storename: storename },
				{
					$set: {
						[`storedata.tickets.${[linkedTicket]}.payments.${[
							mostRecentPaymentID,
						]}`]: payment,
					},
				}
			);
		}

		await storesCollection.updateOne(
			{ storename: storename },
			{
				$set: {
					[`storedata.payments.${[mostRecentPaymentID]}`]: payment,
				},
			}
		);

		console.log("wow");
		return {};
	}

	async liveSearchResults(storename, search) {
		const store = await storesCollection.findOne({ storename: storename });

		search = search.trim();

		const storeTickets = Object.keys(store.storedata.tickets);
		const storeCustomers = Object.keys(store.storedata.customers);
		const storePayments = Object.keys(store.storedata.payments);
		let resultsFound = {
			tickets: [],
			customers: [],
			payments: [],
		};

		for (let i = 0; i < storeTickets.length; i++) {
			if (storeTickets[i].indexOf(search) > -1) {
				resultsFound.tickets.push(storeTickets[i]);
			}
		}
		for (let i = 0; i < storeCustomers.length; i++) {
			if (storeCustomers[i].indexOf(search) > -1) {
				resultsFound.customers.push(storeCustomers[i]);
			}
		}
		for (let i = 0; i < storePayments.length; i++) {
			if (storePayments[i].indexOf(search) > -1) {
				resultsFound.payments.push(storePayments[i]);
			}
		}
		return resultsFound;
	}

	async createNewCustomer(formData, storename) {
		//validate phone number
		if (!validator.isMobilePhone(formData.phone)) {
			this.errors["phoneError"] = "Invalid phone number";
			return [this.errors, formData];
		}

		//Get store we are working with
		const store = await storesCollection.findOne({
			storename: storename,
		});

		//check if phone number is already registered
		if (store.storedata.customers.hasOwnProperty(formData.phone)) {
			this.errors["phoneError"] = "Customer already in system";
			return [this.errors, formData];
		}

		//add customer info to store.storedata.customers
		const customer = {
			firstname: formData.firstname.trim().toLowerCase(),
			lastname: formData.lastname.trim().toLowerCase(),
			phone: formData.phone.trim(),
			email: formData.email.trim().toLowerCase(),
			payments: {},
			tickets: {},
			dateJoined: new Date().toDateString(),
		};

		storesCollection.updateOne(
			{
				storename: storename,
			},
			{
				$set: {
					[`storedata.customers.${[formData.phone]}`]: customer,
				},
			}
		);

		return [{}, customer];
	}

	async getPhone(ticketID, storename) {
		const store = await storesCollection.findOne({ storename: storename });

		const phone = store.storedata.tickets[ticketID].customer.phone;
		return phone;
	}
	async updateTicketStatus(selection, ticketID, phone, storename) {
		console.log(phone);
		const latestUpdate = new Date().getTime();
		storesCollection.updateOne(
			{
				storename: storename,
			},
			{
				$set: {
					[`storedata.tickets.${[ticketID]}.status`]: selection,
					[`storedata.tickets.${[ticketID]}.lastUpdated`]:
						latestUpdate,
					[`storedata.customers.${[phone]}.tickets.${[
						ticketID,
					]}.status`]: selection,
					[`storedata.customers.${[phone]}.tickets.${[
						ticketID,
					]}.lastUpdated`]: latestUpdate,
				},
			}
		);
		return await this.updateTicketList(storename);
	}
	async updateTicketIssue(selection, ticketID, phone, storename) {
		console.log(phone);
		const latestUpdate = new Date().getTime();
		storesCollection.updateOne(
			{
				storename: storename,
			},
			{
				$set: {
					[`storedata.tickets.${[ticketID]}.issue`]: selection,
					[`storedata.tickets.${[ticketID]}.lastUpdated`]:
						latestUpdate,
					[`storedata.customers.${[phone]}.tickets.${[
						ticketID,
					]}.issue`]: selection,
					[`storedata.customers.${[phone]}.tickets.${[
						ticketID,
					]}.lastUpdated`]: latestUpdate,
				},
			}
		);
		const [tickets, store] = await this.updateTicketList(storename);
		return tickets;
	}

	async getStore(storename) {
		return storesCollection.findOne({ storename: storename });
	}

	getCurrentDate() {
		let dateObj = new Date();

		let date = ("0" + dateObj.getDate()).slice(-2);

		// current month
		let month = ("0" + (dateObj.getMonth() + 1)).slice(-2);

		// current year
		let year = dateObj.getFullYear();

		// current hours
		let hours = dateObj.getHours();

		// current minutes
		let minutes = dateObj.getMinutes();

		// current seconds
		let seconds = dateObj.getSeconds();

		return (
			year +
			"-" +
			month +
			"-" +
			date +
			" " +
			hours +
			":" +
			minutes +
			":" +
			seconds
		);
	}

	async createNewTicket(formData, storename) {
		//validate phone number
		if (!validator.isMobilePhone(formData.phone)) {
			this.errors["phoneError"] = "Invalid phone number";
			return [this.errors, formData];
		}

		//Get store we are working with
		const store = await storesCollection.findOne({
			storename: storename,
		});

		let mostRecentTicketNum;

		//If no tickets are in the store (new store) start count at 2000
		if (Object.keys(store.storedata.tickets).length === 0) {
			mostRecentTicketNum = 2000;
		} else {
			//find most recent ticket# created
			mostRecentTicketNum =
				Math.max(
					...Object.keys(store.storedata.tickets).map((i) =>
						parseInt(i)
					)
				) + 1;
		}

		//ticket object to add
		const ticket = {
			customer: {
				firstname: formData.firstname.trim().toLowerCase(),
				lastname: formData.lastname.trim().toLowerCase(),
				phone: formData.phone.trim(),
				email: formData.email.trim().toLowerCase(),
			},
			subject: formData.subject.trim(),
			issue: formData.issue,
			description: formData.description.trim(),
			status: "New",
			shipping: {
				tracking: "",
				carrier: "",
			},
			payments: {},
			lastUpdated: new Date().getTime(),
			dateCreated: new Date().toDateString(),
			smsData: [],
		};

		//if customer info put in is not in system, then create new customer also
		if (!store.storedata.customers.hasOwnProperty(formData.phone)) {
			const customer = {
				firstname: formData.firstname.trim().toLowerCase(),
				lastname: formData.lastname.trim().toLowerCase(),
				phone: formData.phone.trim(),
				email: formData.email.trim().toLowerCase(),
				payments: {},
				tickets: {},
				dateJoined: new Date().toDateString(),
			};

			storesCollection.updateOne(
				{
					storename: storename,
				},
				{
					$set: {
						[`storedata.customers.${[formData.phone]}`]: customer,
					},
				}
			);
		} else {
			if (
				formData.firstname.trim().toLowerCase() !==
				store.storedata.customers[formData.phone].firstname
			) {
				this.errors["firstnameError"] =
					"Firstname doesnt match account on file";
				return [this.errors, formData];
			} else if (
				formData.lastname.trim().toLowerCase() !==
				store.storedata.customers[formData.phone].lastname
			) {
				this.errors["lastnameError"] =
					"Lastname doesnt match account on file";
				return [this.errors, formData];
			}
		}

		//Add ticket:data pair to storedata.customers
		storesCollection.updateOne(
			{
				storename: storename,
			},
			{
				$set: {
					[`storedata.customers.${[formData.phone]}.tickets.${[
						mostRecentTicketNum,
					]}`]: {
						subject: formData.subject.trim(),
						issue: formData.issue,
						description: formData.description.trim(),
						status: "New",
						shipping: {
							tracking: "",
							carrier: "",
						},
						payments: {},
						lastUpdated: new Date().getTime(),
						dateCreated: new Date().toDateString(),
					},
				},
			}
		);

		//Add ticket:data pair to storedata.tickets
		storesCollection.updateOne(
			{
				storename: storename,
			},
			{
				$set: {
					[`storedata.tickets.${[mostRecentTicketNum]}`]: ticket,
				},
			}
		);

		return [{}, ticket, mostRecentTicketNum];
	}

	async getCustomerData(storename, phone) {
		//get store were working with
		const store = await storesCollection.findOne({ storename: storename });
		return store.storedata.customers[phone];
	}
	async getTicketData(storename, ticketID) {
		//get store were working with
		const store = await storesCollection.findOne({ storename: storename });
		return store.storedata.tickets[ticketID];
	}
	async getPaymentData(storename, paymentNumber) {
		const store = await storesCollection.findOne({ storename: storename });
		return store.storedata.payments[paymentNumber];
	}

	async updateTicketList(storename) {
		//get store we are working with
		const store = await storesCollection.findOne({ storename: storename });

		//create array sorted by recently updated
		const tickets = store.storedata.tickets;

		const sortedTickets = [];
		for (let ticket in tickets) {
			sortedTickets.push([ticket, tickets[ticket]]);
		}

		sortedTickets.sort((a, b) => {
			return b[1].lastUpdated - a[1].lastUpdated;
		});

		return [sortedTickets, store];
	}

	async updateCustomerList(storename) {
		//get store we are working with
		const store = await storesCollection.findOne({ storename: storename });

		//create array sorted by recently updated
		const customers = store.storedata.customers;
		console.log(customers);

		const sortedCustomers = [];
		for (let customer in customers) {
			sortedCustomers.push([customer, customers[customer]]);
		}

		sortedCustomers.sort(function (a, b) {
			return a[1].firstname > b[1].firstname ? 1 : -1;
		});

		return [sortedCustomers, store];
	}
	async updatePaymentsList(storename) {
		//get store we are working with
		const store = await storesCollection.findOne({ storename: storename });

		//create array sorted by recently updated
		const payments = store.storedata.payments;

		const sortedPayments = [];
		for (let payment in payments) {
			sortedPayments.push([payment, payments[payment]]);
		}
		sortedPayments.sort(function (a, b) {
			return a[1].firstname > b[1].firstname ? 1 : -1;
		});

		return [sortedPayments, store];
	}

	isValidPhone(phone) {
		if (
			/(\+\d{1,3}\s?)?((\(\d{3}\)\s?)|(\d{3})(\s|-?))(\d{3}(\s|-?))(\d{4})(\s?(([E|e]xt[:|.|]?)|x|X)(\s?\d+))?/g.test(
				phone
			)
		)
			return true;
		return false;
	}

	isValidEmail(email) {
		if (validator.isEmail(email)) return true;
		return false;
	}

	async updateTicketInfo(storename, newInfo, phone) {
		const newSubject = newInfo.subject;
		const newDescription = newInfo.description;
		const ticketID = newInfo.ticketID;

		console.log(newSubject);

		await storesCollection.updateOne(
			{ storename: storename },
			{
				$set: {
					[`storedata.tickets.${[ticketID]}.description`]:
						newDescription,
					[`storedata.customers.${[phone]}.tickets.${[
						ticketID,
					]}.description`]: newDescription,
				},
			}
		);
		await storesCollection.updateOne(
			{ storename: storename },
			{
				$set: {
					[`storedata.tickets.${[ticketID]}.subject`]: newSubject,
					[`storedata.customers.${[phone]}.tickets.${[
						ticketID,
					]}.subject`]: newSubject,
				},
			}
		);
	}

	async updateCustomerContactInfo(storename, newInfo) {
		let { newFirstname, newLastname, oldPhone, newPhone, newEmail } =
			newInfo;

		//New Data to store, not yet validated
		newFirstname = newFirstname.trim().toLowerCase();
		newLastname = newLastname.trim().toLowerCase();
		newPhone = newPhone.trim();
		oldPhone = oldPhone.trim().replace(/\D/g, "");
		newEmail = newEmail.trim().toLowerCase();

		//get store
		const store = await storesCollection.findOne({ storename: storename });

		//validate newPhone and newEmail
		if (newPhone.length > 0) {
			if (!this.isValidPhone(newPhone))
				return [{ phoneError: "Not a valid phone number" }, ""];
		}

		if (newEmail.length > 0)
			if (!validator.isEmail(newEmail))
				return [{ emailError: "Not a valid email" }, ""];

		//see if phone is already in system
		if (
			oldPhone !== newPhone &&
			store.storedata.customers.hasOwnProperty(newPhone)
		)
			return [{ phoneError: "Phone already in system" }, ""];
		else if (oldPhone !== newPhone) {
			//update customers phone number
			await storesCollection.updateOne(
				{
					storename: storename,
				},
				{
					$rename: {
						[`storedata.customers.${[
							oldPhone,
						]}`]: `storedata.customers.${newPhone}`,
					},
				}
			);
		}

		//update info in customers.phone object
		await storesCollection.updateOne(
			{
				storename: storename,
			},
			{
				$set: {
					[`storedata.customers.${[newPhone]}.phone`]: newPhone,
					[`storedata.customers.${[newPhone]}.firstname`]:
						newFirstname,
					[`storedata.customers.${[newPhone]}.lastname`]: newLastname,
					[`storedata.customers.${[newPhone]}.email`]: newEmail,
				},
			}
		);

		//update info in each ticket customer has
		if (
			Object.keys(store.storedata.customers[oldPhone]?.tickets).length > 0
		) {
			const ticketsToUpdate = Object.keys(
				store.storedata.customers[oldPhone]?.tickets
			);
			for (const ticket of ticketsToUpdate) {
				await storesCollection.updateOne(
					{ storename: storename },
					{
						$set: {
							[`storedata.tickets.${[
								ticket,
							]}.customer.firstname`]: newFirstname,
							[`storedata.tickets.${[ticket]}.customer.lastname`]:
								newLastname,
							[`storedata.tickets.${[ticket]}.customer.phone`]:
								newPhone,
							[`storedata.tickets.${[ticket]}.customer.email`]:
								newEmail,
						},
					}
				);
			}
		}
		//TODO: NEED TO UPDATE INFORMATION IN INVOICES AND ESTIMATES AS WELL, AND ANYWHERE ELSE CUSTOMER DATA IS STORED

		return [{}, newPhone];
	}

	async trackShipment(ticketID, user) {
		const storename = user.storename;

		/* 1. need to get trackingObj from the store->tickets->ticket.trackingObj
		//
		*/

		// const { tracking_number, carrier } = trackingObj;

		// Fetch API Call for tracking and carrier
		// const url = `https://api.goshippo.com/tracks/${carrier}/${tracking_number}`;
		// const response = await fetch(url, {
		// 	headers: {
		// 		Authorization: `ShippoToken ${process.env.SHIPPO_API_TOKEN}`,
		// 	},
		// });
		// const json = await response.json();

		// // If tracking is invalid return with errors
		// if (json.servicelevel.token == null) {
		// 	this.errors["tracking_error"] = "Tracking number invalid";
		// 	return this.errors;
		// }

		// //TODO: when JSON OBJECT IS DONE THEN WE CAN GET MOST RECENT ADDRESS AND USE FOR GEOLOCATOPN API

		// //TODO: Return any required information needed, for now just everything
		// return json;
	}

	async updateTicketShippingInfo(info, storename) {
		const { trackingNumber, carrier, ticketID, phone } = info;

		console.log(trackingNumber);

		await storesCollection.updateOne(
			{ storename: storename },
			{
				$set: {
					[`storedata.customers.${[phone]}.tickets.${[
						ticketID,
					]}.shipping.tracking`]: trackingNumber,
					[`storedata.customers.${[phone]}.tickets.${[
						ticketID,
					]}.shipping.carrier`]: carrier,
					[`storedata.tickets.${[ticketID]}.shipping.carrier`]:
						carrier,
					[`storedata.tickets.${[ticketID]}.shipping.tracking`]:
						trackingNumber,
				},
			}
		);
	}

	async receiveSms(smsData) {
		console.log(smsData);
		const subAccountSid = smsData.AccountSid;
		const message = smsData.Body;
		const fromNumber = smsData.From.substring(2);

		//find subaccount to add msg to
		// const store = await storesCollection.findOne({
		// 	"storedata.api.twilio.sid": subAccountSid,
		// });

		//also update the status of the ticket to CUSTOMER_REPLY
		//maybe setup socket.io connection here to display msg if user is on that page
	}

	async sendSms(storename, ticketID, toPhone, message) {
		const store = await storesCollection.findOne({ storename: storename });

		const subAccountSid = store.storedata.api.twilio.sid;
		const subAccountAuthToken = store.storedata.api.twilio.authToken;

		const client = require("twilio")(subAccountSid, subAccountAuthToken);

		let subAccount = null;

		try {
			subAccount = await client.incomingPhoneNumbers.list({
				limit: 20,
			});
		} catch (error) {
			console.log(error);
		}

		const msg = await client.messages
			.create({
				from: subAccount[0].phoneNumber,
				body: message,
				to: "1" + toPhone,
			})
			.then(async (message) => {
				await storesCollection.updateOne(
					{ storename: storename },
					{
						$push: {
							[`storedata.tickets.${[ticketID]}.smsData`]: {
								$each: [
									{
										timestamp: Date.now(),
										from: "store",
										message: message.body,
									},
								],
								$position: -1,
							},
						},
					}
				);
				return message.body;
			});
		console.log(msg);
		return msg;
	}

	async forgotPassword(data) {
		//validate email
		if (!validator.isEmail(data.email))
			this.errors["error"] = "Not a valid email";

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
				to: `${user.email}`, // list of receivers
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

	async clockIn(user, clockInTime) {
		console.log("user clock in");

		await usersCollection.updateOne(
			{ email: user.email },
			{
				$set: {
					[`timeClock.clockInTime`]: clockInTime,
					[`timeClock.clockOutTime`]: null,
				},
			}
		);
	}
	async clockOut(user, clockOutTime) {
		console.log("user clock Out");

		const userData = await usersCollection.findOne({ email: user.email });

		const clockInTime = userData.timeClock.clockInTime;

		const timeClockedIn = clockOutTime - userData.timeClock.clockInTime;

		let hours = timeClockedIn / (1000 * 60 * 60);

		await usersCollection.updateOne(
			{ email: userData.email },
			{
				$set: {
					[`timeClock.clockOutTime`]: clockOutTime,
					[`timeClock.clockInTime`]: null,
				},
				$push: {
					[`timeClock.clockHistory`]: {
						date: new Date().toISOString().split("T")[0],
						clockInTime: clockInTime,
						clockOutTime: clockOutTime,
						hoursWorked: hours,
					},
				},
			}
		);
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

		if (data.password.length > 100)
			this.errors["password"] = "Password cannot exceed 100 characters";

		//validate passwordConfirm
		if (data.passwordConfirm !== data.password)
			this.errors["passwordConfirm"] = "Passwords do not match";

		// Check if signUpCode is valid
		if (!("storename" in data)) {
			const result = await storesCollection.findOne({
				signUpCode: data.signUpCode,
			});
			if (result == null)
				this.errors["signUpCode"] = "Store you are joining not found";
		}
	}

	async updateTicketStatusSettings(storename, newData) {
		let { statusName, statusColor } = newData;
		console.log(statusColor);

		statusName =
			statusName.charAt(0).toUpperCase() +
			statusName.substring(1).toLowerCase();

		await storesCollection.updateOne(
			{ storename: storename },
			{
				$push: {
					"storeSettings.tickets.status": [statusName, statusColor],
				},
			}
		);
	}
	async deleteTicketStatusSettings(storename, newData) {
		let { statusName, statusColor } = newData;

		statusName =
			statusName.charAt(0).toUpperCase() +
			statusName.substring(1).toLowerCase();
		console.log(statusName);

		await storesCollection.updateOne(
			{ storename: storename },
			{
				$pull: {
					"storeSettings.tickets.status": {
						$in: [statusName],
					},
				},
			}
		);
	}

	async getEmployeesTimeclockHistory(storename, fromDate, toDate) {
		const employees = await usersCollection
			.find({ storename: storename })
			.toArray();

		const employeesClockHistory = [];

		console.log(employees);

		for (let i = 0; i < employees.length; i++) {
			let totalHours = 0;
			employees[i].timeClock.clockHistory.forEach((item) => {
				if (item.date >= fromDate && item.date <= toDate) {
					totalHours += item.hoursWorked;
				}
			});
			if (totalHours > 0) {
				employeesClockHistory.push([employees[i].fullname, totalHours]);
			}
		}

		const store = await storesCollection.findOne({ storename: storename });
		return {
			employeesClockHistory,
			payPeriod: store.storeSettings.payPeriod,
		};
	}

	async updateStoreTaxRate(storename, taxRate) {
		console.log(taxRate);

		await storesCollection.updateOne(
			{ storename: storename },
			{
				$set: {
					"storeSettings.payments.taxRate": taxRate.replace(
						/^\D+/g,
						""
					),
				},
			}
		);
	}

	async updateStoreAddress(storename, newData) {
		const { primary, city, province, postalCode } = newData;
		await storesCollection.updateOne(
			{ storename: storename },
			{
				$set: {
					"storeSettings.payments.address.primary": primary,
					"storeSettings.payments.address.city": city,
					"storeSettings.payments.address.province": province,
					"storeSettings.payments.address.postal": postalCode,
				},
			}
		);
	}
	async addIssue(storename, issue) {
		await storesCollection.updateOne(
			{ storename: storename },
			{
				$addToSet: {
					"storeSettings.tickets.issue": issue,
				},
			}
		);
	}

	async deleteTicket(storename, ticketID) {
		const store = await storesCollection.findOne({ storename: storename });

		const storeTickets = Object.keys(store.storedata.tickets);

		if (!storeTickets.includes(ticketID)) return;

		const phoneOnTicket = store.storedata.tickets[ticketID].customer.phone;
		const paymentsOnTicket = Object.keys(
			store.storedata.tickets[ticketID].payments
		);

		paymentsOnTicket.forEach(async (item) => {
			await storesCollection.updateOne(
				{ storename: storename },
				{
					$set: {
						[`storedata.payments.${item}.linkedTicket`]: "",
						[`storedata.customers.${phoneOnTicket}.payments.${item}.linkedTicket`]:
							"",
					},
				}
			);
		});

		await storesCollection.updateOne(
			{ storename: storename },
			{
				$unset: {
					[`storedata.tickets.${ticketID}`]: "",
					[`storedata.customers.${phoneOnTicket}.tickets.${ticketID}`]:
						"",
				},
			}
		);
	}
	async deletePayment(storename, paymentNumber) {
		const store = await storesCollection.findOne({ storename: storename });
		const storePayments = Object.keys(store.storedata.payments);

		if (!storePayments.includes(paymentNumber)) return;

		const phoneOnPayment =
			store.storedata.payments[paymentNumber].customer.phone;

		await storesCollection.updateOne(
			{ storename: storename },
			{
				$unset: {
					[`storedata.payments.${paymentNumber}`]: "",
					[`storedata.customers.${phoneOnPayment}.payments.${paymentNumber}`]:
						"",
				},
			}
		);
	}

	async removeIssue(storename, issue) {
		await storesCollection.updateOne(
			{ storename: storename },
			{
				$pull: {
					"storeSettings.tickets.issue": issue,
				},
			}
		);
	}

	async addCategory(storename, category) {
		await storesCollection.updateOne(
			{ storename: storename },
			{
				$addToSet: {
					"storeSettings.payments.categories": category,
				},
			}
		);
	}
	async removeCategory(storename, category) {
		await storesCollection.updateOne(
			{ storename: storename },
			{
				$pull: {
					"storeSettings.payments.categories": category,
				},
			}
		);
	}

	async changeAccountPassword(actualOldHashedPassword, newInfo) {
		const { oldPlainTextPassword, newPassword, confirmNewPassword } =
			newInfo;

		const passwordMatch = await this.compareAsync(
			oldPlainTextPassword,
			actualOldHashedPassword
		);

		if (!passwordMatch)
			return { passwordError: "Old password is incorrect" };

		if (newPassword.length < 8)
			return { passwordError: "Password must be at least 8 characters" };

		if (newPassword.length > 100)
			return { passwordError: "Password cannot exceed 100 characters" };

		if (newPassword !== confirmNewPassword)
			return { passwordError: "New Passwords do not match" };

		const newHashedPassword = this.hashPrivateInfo(newPassword);

		await usersCollection.updateOne(
			{ password: actualOldHashedPassword },
			{
				$set: {
					password: newHashedPassword,
					passwordConfirm: newHashedPassword,
				},
			}
		);
		return {};
	}

	async compareAsync(param1, param2) {
		return new Promise(function (resolve, reject) {
			bcrypt.compare(param1, param2, function (err, res) {
				if (err) {
					reject(err);
				} else {
					resolve(res);
				}
			});
		});
	}

	async employeeRegister() {
		this.cleanUp(this.data);
		await this.validate(this.data);

		//if there are any errors then stop and print errors
		if (Object.keys(this.errors).length > 0) {
			return [this.errors, this.data];
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
			admin: false,
			timeClock: {
				clockInTime: null,
				clockOutTime: null,
				clockHistory: [],
			},
		};

		//TODO:DO I even need employees array??
		// //add user into stores collection under the store they signed up for
		// storesCollection.updateOne(
		// 	{ signUpCode: this.data.signUpCode },
		// 	{
		// 		$push: {
		// 			employees: employee,
		// 		},
		// 	}
		// );

		//add user into users collection
		usersCollection.insertOne(employee);

		console.log("employee successfully joined store");
	}
}

module.exports = User;
