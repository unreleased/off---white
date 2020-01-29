const Request = require('request-promise');
const cheerio = require('cheerio');
const fs = require('fs');
const Discord = require('discord.js');
const async = require('async');


const SHOP_URL = 'www.off---white.com'

// User
var tasks = fs.readFileSync('tasks.json', 'utf8');
    tasks = JSON.parse(tasks);



var wh = tasks.client.webhook;
    wh = wh.split('/');

const webhook = new Discord.WebhookClient(wh[5], wh[6])



class Instance {

    constructor(user) {
        this.user         = user;
        this.user.billing = {};
        this.user.order   = {};
        this.user.payment = {};

        // Riskified Object
        this.rx = {
            beacon     : this.getRiskifiedBeacon(),
            cookie     : this.getRiskifiedCookieId(),
            timezone   : this.getRiskifiedTimezone(),
            lowestTime : false,
            href       : 'https://www.off---white.com/en/GB/',
            referrer   : '',
            page       : '',
            timestamp  : '',
        };

        // Variti Object
        this.variti = {
            redirect: ''
        }

        // User Agent
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.86 Safari/537.36'

        // Max spend limit
        this.maxOrderAmount = 350

        // Prevent global cookie jar
        this.jar = Request.jar();

        // Set instance request
        this.request = Request.defaults({
            jar                     : this.jar,
            proxy                   : this.user.proxy, // change false
            simple                  : false,
            method                  : 'GET',
            forever                 : true,
            followRedirect          : false,
            followAllRedirects      : false,
            resolveWithFullResponse : true,
            gzip                    : true
        })

        this.timer = {
            start: 0,
            end  : 0
        }

        this.start();
        // this.populateCart();
    }

    async start() {

        // Get Variti cookies
        await this.findVariti();
        await this.visitVariti();
        await this.solveVariti();
        await this.completeVariti();

        // Login user
        await this.login();
        

        // Get CSRF token
        this.csrf = await this.getCSRF()
        while (!this.csrf) {
            await wait(300);
            this.csrf = await this.getCSRF();
        }

        // Solve riskified after logging in.
        this.rx.href = "https://www.off---white.com/en/GB"
        await this.solveRiskified();


        // Add and remove an item from your cart to generate a valid guest token.
        // this.populateCart();

        // Get product from off white API
        var monitor = await this.getRestock();
        while (!monitor) {
            await wait(300);
            monitor = await this.getRestock();
        }
        

        // Cart item
        this.timer.start = ~~(new Date().getTime() / 1000)
        await this.cart(monitor);

        // Get billing
        var address_ids = await this.getBilling();
        if (!address_ids) {
            return this.ts(`There was an error getting your billing details. This is most-likely a carting issue`)
        }

        // Submit billing
        await this.billing();

        // Get delivery
        await this.delivery();

        /** Get everything from Billing, skip delivery. */

        if (this.order.amount < this.maxOrderAmount) {
            await this.getToken();
            await this.getPaymentFrame();
            await this.pay();
            await this.process()
            this.timer.end = ~~(new Date().getTime() / 1000)
            await this.getOrder()
            return
        } else {
            this.ts(`You couldn't complete order, The price is above the set limit of ${this.maxOrderAmount} EUR`);
        }

    }

    async findVariti() {
        var opts = {
            url: "https://www.off---white.com",
            method: "GET",
            proxy: this.user.proxy,
            headers: {
                'Host'             : "www.off---white.com",
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8',
            }
        }

        var resp = this.request.get(opts).then((res) => {
            if (res.headers.location != undefined) {
                this.variti.redirect = res.headers.location
                this.ts(`Variti redirect found`);
                return true;
            } else {
                return false;
            }
        }).catch((err) => {
            console.log(err);
            return false;
        })

        return resp;
    }

    async visitVariti() {
        var opts = {
            url: this.variti.redirect,
            method: "GET",
            proxy: false,
            headers: {
                'Host'             : 'ohio8.vchecks.me',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8',
            }
        }

        this.ts(`Attempting to solve Variti...`)

        var resp = this.request(opts).then((res) => {
            if (res.statusCode === 307) {
                this.variti.redirect = res.headers.location
                this.ts("Succesfully visited Variti and got second redirect")
                return true;
            } else {
                this.ts("Failed to find Variti redirect")
                return false;
            }

        });

        return resp;
    }

    async solveVariti() {
        var opts = {
            url: this.variti.redirect,
            proxy: this.user.proxy,
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8',
            }
        }

        var resp = this.request(opts).then((res) => {

            if (res.statusCode == 307) {
                this.ts('Finishing Variti solution.')
            } else {
                this.ts('[SOLVEVARITI] Variti hit an error')
                console.log(res.headers.location);
                console.log(res.body)
                console.log(res.statusCode)
            }

            

            return true;
        })

        return resp;
    }

    async completeVariti() {
        var opts = {
            url: 'https://www.off---white.com/en/GB/cart.json',
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8',
            }
        }

        var resp = this.request(opts).then((res) => {

            if (res.statusCode === 200) {
                this.ts(`Variti solved successfully.`)
            } else {
                this.ts(`Variti failed.`)
                console.log(res.headers.location);
                console.log(res.body)
                console.log(res.statusCode)
            }

            

            return true;
        })

        return resp;
    }

    async login() {
        var opts = {
            url: 'https://www.off---white.com/en/GB/login',
            method: 'POST',
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8',
            },
            form: {
                spree_user: {
                    email    : this.user.email,
                    password : this.user.password
                }
            }
        }
    
        this.ts(`Logging in: ${this.user.email}`);
        var resp = this.request(opts).then((res) => {
            if (res.headers.location === undefined) {
                if (res.statusCode == 403) {
                    this.ts(`Couldn't login because this proxy is banned.`)
                } else {
                    this.ts(`Invalid email or password`)
                }

                return false;
            }

            return this.ts(`Successfully logged in: ${this.user.email}`);

        }).catch((err) => {
            console.log(err);
            return this.ts("[LOGIN] An error occurred!");
        });
    
        return resp;
    }

    async getRestock() {
        var opts = {
            url     : 'https://notify.express/middleware/off-white/?token=9y43rWeVEGYuW2QdP6Ab58akChd',
            timeout : 1000,
            json    : true,
            proxy   : false
        }
    
        var resp = this.request(opts).then((res) => {

            console.log(res.body);
    
            this.ts(`Product status: ${res.body.available}`)

            // testing
            // return 111490
    
            if (res.body.available) {
                this.ts(`Product found instock: ${res.body.variant_id}`)
                return res.body.variant_id
            } else {
                /* this.ts(`[DEBUG MODE] Forcing variant`)
                this.ts(`[DEBUG MODE] Forcing variant`)
                this.ts(`[DEBUG MODE] Forcing variant`)
                this.ts(`[DEBUG MODE] Forcing variant`)
                this.ts(`[DEBUG MODE] Forcing variant`)
                this.ts(`[DEBUG MODE] Forcing variant`)
                this.ts(`[DEBUG MODE] Forcing variant`) */
                return false
            }
    
        }).catch((err) => {
            this.ts("[GETRESTOCK] An error occurred!");
            return false
        });
    
        return resp;
    }

    async cart(variant) {
        var opts = {
            url    : `https://www.off---white.com/en/GB/frame_increment_item_quantity_from_cart?variant_id=${variant}`,
            method : 'HEAD'
        }
    
        this.ts(`Started`)
        var resp = this.request(opts).then((res) => {
            return this.ts("Carted!");
        }).catch((err) => {
            return this.ts("[CART] An error occurred!");
        });
    
        return resp;
        // 500 Internal Server Error
    }

    async getCSRF() {
        var opts = {
            url: 'https://www.off---white.com/admin/authorization_failure',
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8'
            }
        }
    
        this.ts('Getting CSRF token for future requests.')

        var resp = this.request(opts).then((res) => {

            var $ = cheerio.load(res.body)

            if ($("meta[name='csrf-token']").length > 0) {
                var token = $("meta[name='csrf-token']").attr("content")
                this.ts(`Token found: ${token}`);
            } else {
                view(res.body);
                this.ts(res.statusCode);

                this.ts(`Failed to find token. Retrying...`)
                return false;
            }

            return token;

        }).catch((err) => {
            console.log(err);
            return this.ts("[GetCSRF] An error occurred!");
        });
    
        return resp;
    }

    async getBilling() {
        var opts = {
            url: 'https://www.off---white.com/en/GB/checkout/address',
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8'
            }
        }
    
        var resp = this.request(opts).then(async (res) => {
            
            if (res.headers.location !== undefined) {
                return false;
            }
    
            var $ = cheerio.load(res.body);

            this.user.billing = {
                firstname      : $("#order_bill_address_attributes_firstname").val(),
                lastname       : $("#order_bill_address_attributes_lastname").val(),
                address1       : $("#order_bill_address_attributes_address1").val(),
                address2       : $("#order_bill_address_attributes_address2").val(),
                city           : $("#order_bill_address_attributes_city").val(),
                country_id     : $("#order_bill_address_attributes_country_id").val(),
                state_id       : $("#order_bill_address_attributes_state_id").val(),
                state_name     : $("#order_bill_address_attributes_state_name").val(),
                zipcode        : $("#order_bill_address_attributes_zipcode").val(),
                phone          : $("#order_bill_address_attributes_phone").val(),
                hs_fiscal_code : $("#order_bill_address_attributes_hs_fiscal_code").val() || '',
            }

            this.order = {
                billing_id         : $("#order_bill_address_attributes_id").val(),
                shipping_id        : $("#order_ship_address_attributes_id").val(),
                state_lock_version : $("#order_state_lock_version").val(),
            }

            this.ts(`[DEBUG] Current URL: ${res.request.uri.href}`)
            this.rx.href = res.request.uri.href
            await this.solveRiskified();

            return true;

        }).catch((err) => {
            this.ts("[GETBILLING] An error occurred!");
            return false;
        });
    
        return resp;
    }

    async billing() {
        var opts = {
            url                : 'https://www.off---white.com/en/GB/checkout/update/address',
            method             : 'POST',
            followAllRedirects : true,
            followRedirect     : true,
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8'
            },
            form: {
                authenticity_token     : this.csrf,
                _method                : 'PATCH',
                terms_and_conditions   : 'yes',
                order: {
                    email              : this.user.email,
                    state_lock_version : this.order.state_lock_version,
                    use_billing        : '1',
                    save_user_address  : '1',
                    bill_address_attributes: Object.assign(this.user.billing, {id: this.order.billing_id}),
                    ship_address_attributes: {
                        id: this.order.shipping_id
                    }
                }
            }
        }

        this.ts(`Submitting billing details...`)
        var resp = this.request(opts).then(async (res) => {

            var $ = cheerio.load(res.body)
    
            this.ts("Got delivery information!");

            this.order = Object.assign(this.order, {
                shipping_id         : $('.shipping-method input').val(),
                shipment_id         : $('#order_shipments_attributes_0_id').val(),
                amount              : $(".amount").eq(1).text().replace(/,/g, '').substring(2),
                state_lock_version  : $("#order_state_lock_version").val(),
            })

            this.ts(`[DEBUG] Current URL: ${res.request.uri.href}`)
            this.rx.referrer = this.rx.href
            this.rx.href = res.request.uri.href
            await this.solveRiskified();
            return true;
        }).catch((err) => {
            return this.ts("[BILLING] An error occurred!");
        });
    
        return resp;
    }

    async delivery() {
        var opts = {
            url                : 'https://www.off---white.com/en/GB/checkout/update/delivery',
            method             : 'POST',
            followRedirect     : true,
            followAllRedirects : true,
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8'
            },
            form: {
                utf8                : '✓',
                _method             : 'PATCH',
                authenticity_token  : this.csrf,
                order: {
                    state_lock_version            : this.order.state_lock_version,
                    shipments_attributes: [{
                        selected_shipping_rate_id : this.order.shipping_id,
                        id                        : this.order.shipment_id
                    }]
                }
            }
        }

    
        var resp = this.request(opts).then(async (res) => {
            var $ = cheerio.load(res.body)
            this.ts("Delivery submitted!");
            this.ts(`[DEBUG] Current URL: ${res.request.uri.href}`)
            this.order.amount = $(".gestpay-data").attr("data-amount")
            this.order.transaction = $(".gestpay-data").attr("data-transaction")
            this.rx.referrer = this.rx.href
            this.rx.href     = res.request.uri.href
            await this.solveRiskified();
            
            return true;
        }).catch((err) => {
            console.log(err)
            return this.ts("[DELIVERY] An error occurred!");
        });
    
        return resp;
    
    }

    async getToken() {
        var opts = {
            url     : 'https://www.off---white.com/en/GB/checkout/payment/get_token.json',
            method  : 'POST',
            json    : true,
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8',
                'X-CSRF-Token'    : this.csrf
            },
            form: {
                transaction       : this.order.transaction,
                amount            : this.order.amount,
                beacon_session_id : this.rx.beacon
            }
        }
    
        this.ts(`Attempting to get payment information`);

        var resp = this.request(opts).then((res) => {
            this.ts(`Got payment token: ${res.body.token}`);
            this.user.payment.payment_token = res.body.token;
            return true;
        }).catch((err) => {
            console.log(err)
            return this.ts("[GETTOKEN] An error occurred!");
        });
    
        return resp;
    }

    async getPaymentFrame() {
        var opts = {
            url: `https://ecomm.sella.it/Pagam/hiddenIframe.aspx?a=9091712&b=${this.user.payment.payment_token}&MerchantUrl=https%3a%2f%2fwww.off---white.com%2fen%2fGB%2fcheckout%2fpayment`,
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8'
            }
        }
    
        var resp = this.request(opts).then((res) => {
    
            var $ = cheerio.load(res.body);
    
            this.gestpay = {
                __VIEWSTATE           : $("#__VIEWSTATE").val(),
                __VIEWSTATEGENERATOR  : $("#__VIEWSTATEGENERATOR").val(),
                __EVENTVALIDATION     : $("#__EVENTVALIDATION").val(),
                cardnumber            : this.user.card.number.split(' ').join(''),
                cardExpiryMonth       : this.user.card.exp_month,
                cardExpiryYear        : this.user.card.exp_year,
                cvv                   : this.user.card.cvv, // 899
                buyerName             : undefined,
                buyerEMail            : undefined,
                inputString           : this.user.payment.payment_token,
                pares                 : '',
                logPostData           : '',
                shopLogin             : ''
            }

            this.ts("Got gestpay payment data");
            return true;
        }).catch((err) => {
            this.ts("[GETPAYMENTFRAME] An error occurred!");
            return false;
        });
    
        return resp;
    }

    async pay() {
        var opts = {
            url: `https://ecomm.sella.it/Pagam/hiddenIframe.aspx?a=9091712&b=${this.user.payment.payment_token}&MerchantUrl=https%3a%2f%2fwww.off---white.com%2fen%2fGB%2fcheckout%2fpayment`,
            method: 'POST',
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8'
            },
            form: this.gestpay
        }

        var resp = this.request(opts).then((res) => {

            var $ = cheerio.load(res.body)
    
            var unformattedToken = $("#form1 > script").html().split("')//]]>")
            this.user.payment.process_token = unformattedToken[0].split("delayedSendResult('0','','','','")[1]
            
            this.ts(`Getting payment success token: ${this.user.payment.process_token}`)

            return true;
            
        }).catch((err) => {
            console.log(err);
            this.ts("[PAY] An error occurred!");
            return false;
        });
    
        return resp;
    
    }

    async process() {
        var opts = {
            url    : 'https://www.off---white.com/checkout/payment/process_token.json',
            method : 'POST',
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8',
                'X-CSRF-Token': this.csrf
            },
            form: {
                token: this.user.payment.process_token
            }
        }
    
        this.ts("Processing token...")
        var resp = this.request(opts).then((res) => {
            this.ts("Token processed");
            return this.ts(res.body);
        }).catch((err) => {
            console.log(err);
            this.ts("[PROCESS] An error occurred!");
            return false;
        });
    
        return resp;
    }

    async getOrder() {
        var opts = {
            url: `https://www.off---white.com/en/GB/orders/${this.order.transaction}`,
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8'
            }
        }
    
        var resp = this.request(opts).then((res) => {

            var $ = cheerio.load(res.body);
            
            var thumbnail = $("table img").attr("src"),
                product   = $("table img").attr("alt"),
                time      = `00:${this.timer.end - this.timer.start}`,
                size      = $(".descItem").text().match(/\(([^)]+)\)/)[1]


            success_discord_webhook(this.order.transaction, product, this.user.email, time, thumbnail, size)

        }).catch((err) => {
            console.log(err);
            this.ts("[GETORDER] An error occurred!");
            return false
        });
    
        return resp;
    }

    async harvestRecaptcha() {


        var opts = {
            url    : 'http://2captcha.com/in.php',
            method : 'POST',
            json   : true,
            form: {
                method     : 'userrecaptcha',
                googlekey  : '6LfRAXkUAAAAAMJTybeTyJcGpiXI1o-H3KEAXM2w',
                pageurl    : 'https://www.off---white.com/en/GB/men/products/omia002f180340041000',
                key        : tasks.client.api2Captcha,
                json       : true,
            }
        }
        
        this.ts(`Starting harvester to create guest order.`)

        var resp = this.request(opts).then(async (res) => {

            var captchaResponse = await this.getCaptchaResponse(res.body.request);
            while (!captchaResponse) {
                await wait(5000);
                captchaResponse = await this.getCaptchaResponse(res.body.request);
                console.log(captchaResponse);
            }

            return captchaResponse;
        }).catch((err) => {
            console.log(err);
            this.ts("[POPULATECART POST] ERROR");
        })

        return resp;
    }

    async getCaptchaResponse(id) {

        var getOpts = {
            url  : `http://2captcha.com/res.php?id=${id}&key=${tasks.client.api2Captcha}&action=get&json=true`,
            json : true
        }

        var resp = this.request(getOpts).then((res) => {

            if (res.body.status) {
                this.ts(`Captcha harvested successfully. Generating order.`)
                return res.body.request
            }

            this.ts(`Captcha not harvested yet.`)
            return false;


        }).catch((err) => {
            this.ts("[POPULATECART GET] ERROR");
        })

        return resp;
    }

    async populateCart() {
        var postOpts = {
            url                : 'https://www.off---white.com/en/GB/orders/populate.json',
            method             : 'POST',
            json               : true,
            headers: {
                'Host'             : 'www.off---white.com',
                'Connection'       : 'keep-alive',
                'Pragma'           : 'no-cache',
                'Cache-Control'    : 'no-cache',
                'Upgrade-Insecure-Requests': '1',
                'User-Agent'       : this.userAgent,
                'Accept'           : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Encoding'  : 'gzip',
                'Accept-Language'  : 'en-GB,en-US;q=0.9,en;q=0.8',
                'Content-type': 'application/json',
                'X-CSRF-Token': this.csrf
            },
            body: {
                //"g-recaptcha-response": await this.harvestRecaptcha(),
                "quantity": 0,
                "variant_id": 107443
            }
        }

        this.request(postOpts).then((res) => {
            if (res.statusCode == "200") {
                this.ts(`Order successfully created. Removing the item we carted.`);
            } else {
                this.ts(`Error carting the product`);
            }
        }).catch((err) => {
            console.log(err);
            this.ts("[POPULATECART SUBMIT] ERROR");
        })
    }
    

    getRiskifiedTimestamp() {
        var date = Math.floor(new Date().getTime())
        var longTs = Math.random() * 1e16;
            date = `${date}0.${longTs}`
    
        return date
    }
    
    getRiskifiedBeacon() {
        var uid = [];
        for (var i = 0; i < 6; i++) uid.push(Math.random().toString(16).substr(2,8));
        return uid.join('-');
    }
    
    getRiskifiedCookieId() {
        "use strict";
        return Math.random().toString(36).substr(2, 15) + Math.random().toString(36).substr(2, 15)
    }
    
    getRiskifiedPageId() {
        "use strict";
        return Math.random().toString(36).substr(3, 6)
    }

    getRiskifiedTimezone() {
        "use strict";
        return JSON.parse(JSON.stringify(-1 * (new Date).getTimezoneOffset()))
    }

    //https://beacon.riskified.com/?shop=www.off---white.com&sid=


    async riskifiedBeaconRequest() {
        var url  = `https://beacon.riskified.com/`
            url += `?shop=${SHOP_URL}`
            url += `&sid=${this.rx.beacon}`
        
        var opts = {
            url    : url,
            method : 'GET'
        }

        var resp = this.request(opts).then((res) => {
            var unformattedToken = res.body.split('function getYyRxId3() { return "');
            var token = unformattedToken[1].split('";}')[0];
            if (token.length > 0) {
                return token;
            }
            return false;
        }).catch((err) => {
            console.log(err);
            this.ts("[RISKIFIEDIMAGEREQUEST] An error occurred!");
            return false;
        });
        return resp;
    }

    async riskifiedImageRequest() {
        var url  = `https://img.riskified.com/img/image-l.gif`
            url += `?t=${this.getRiskifiedTimestamp()}`
            url += `&c=${this.rx.cookie}`,
            url += `&p=${this.rx.page}`
            url += `&a=${this.rx.beacon}`
            url += `&o=${SHOP_URL}`
            url += `&rt=${this.rx.timestamp}`

        var opts = {
            url    : url,
            method : 'GET'
        }
        
        var startTime = Date.now()
        var resp = this.request(opts).then((res) => {
            var timeElapsed = Date.now() - startTime
            this.ts(`[DEBUG] Image request completed in: ${timeElapsed}`)
            if (!this.rx.lowestTime) {
                this.rx.lowestTime = timeElapsed
            } else if (timeElapsed < this.rx.lowestTime) {
                this.rx.lowestTime = timeElapsed
            }
            return true;
        }).catch((err) => {
            console.log(err);
            this.ts("[RISKIFIEDIMAGEREQUEST] An error occurred!");
            return false;
        });
        
        return resp;
    }

    async solveRiskified() {
        this.rx.timestamp = await this.riskifiedBeaconRequest();
        this.rx.page      = this.getRiskifiedPageId();
        var imageRequestsComplete = true

        for (var i = 0; i < 6; i++) {
            var imageResponse = await this.riskifiedImageRequest()
            if (!imageResponse) {
                this.ts("[RISKIFIED] An error occured while issuing image requests")
                imageRequestsComplete = false
                break
            } else if (i == 5) {
                this.ts("Image requests completed")
            }
        }

        var url  = `https://c.riskified.com/client_infos.json`
            url += `?lat=${this.rx.lowestTime}`
            url += `&timezone=${this.rx.timezone}`
            url += `&timestamp=${this.rx.timestamp}`
            url += `&cart_id=${this.rx.beacon}`
            url += `&shop_id=${SHOP_URL}`
            url += `&referrer=${this.rx.referrer}`
            url += `&href=${this.rx.href}`
            url += `&riskified_cookie=${this.rx.cookie}`
            url += `&color_depth=24`
            url += `&page=${this.rx.page}`
            url += `&shop=${SHOP_URL}`
            url += `&hardware_concurrency=8`
            url += `&has_touch=false`
            url += `&debug_print=false`
            url += `&console_error=console.memory is undefined`
            url += `&battery_error=Error getBattery()`
            url += `&initial_cookie_state_0=http`
            url += `&initial_cookie_state_1=local`
            url += `&initial_cookie_state_2=session`

        var opts = {
            url    : url,
            method : 'GET'
        }
        
        var resp = this.request(opts).then((res) => {
            if (imageRequestsComplete) {
                this.rx.lowestTime = false
                return this.ts("Riskified Completed");
            } else {
                return this.ts("Riskified Partially Completed");
            }

        }).catch((err) => {
            console.log(err);
            this.ts("[RISKIFIED] An error occurred!");
            return false;
        });

        return resp

    }

    async ts(msg) {
        var d = new Date();
        var ts = `[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(d.getMilliseconds(), 100)}]`;
    
        console.log(`${ts} [${this.user.email}] ${msg}`)
    
        function pad(value, lt = 10) {
    
            var temp = value;
            if (value < lt) {
                temp = '0' + value;
            } else {
                temp = value;
            }
        
            if (lt >= 100) {
                if (value < 10) {
                    temp = '0' + temp;
                }
            }
        
            return temp;
        }
    }

}



function view(body) {
    fs.writeFileSync('view.html', body)
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function success_discord_webhook(order, product, email, time, thumbnail, size) {

    // Email privacy only first 2 and last two characters.
    var em = email.split('@');
    var f3 = em[0].substr(0,2)
    var l3 = em[0].substr(-2);

    var l = em[0].length - 4;
    // console.log(l);

    email = `${f3}${"\\**".repeat((~~(em[0].length - 4) / 2))}${l3}@${em[1]}`


    var embed = new Discord.RichEmbed()
        .setTitle(`Successful Off White Checkout`)
        .setDescription(`Successful checkout for ${product}`)
        .setColor('#e74649')
        .setTimestamp()
        .setURL(`https://www.off---white.com/en/GB/orders/${order}`)
        .setFooter('Developed by @unreleased and @notchefbob', 'https://notify.express/assets/img/express.png')
        .setThumbnail(thumbnail)
        .addField('Email', email, true)
        .addField('Checkout Time', time, true)
        .addField('Size', `${size}US`, true)
        .addField('Order', order, true)

    webhook.send(embed)
}




async.each(tasks.users, function(user) {
    new Instance(user);
})