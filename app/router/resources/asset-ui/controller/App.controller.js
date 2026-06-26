sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Select",
  "sap/ui/core/Item",
  "sap/m/TextArea",
  "sap/m/Input",
  "sap/m/HBox",
  "sap/m/FlexItemData",
  "sap/m/VBox"
], function (
  Controller,
  JSONModel,
  MessageBox,
  MessageToast,
  Dialog,
  Button,
  Label,
  Select,
  Item,
  TextArea,
  Input,
  HBox,
  FlexItemData,
  VBox
) {
  "use strict";

  const IS_WORK_ZONE_RUNTIME = window.location.hostname.includes("launchpad.cfapps");

  let SERVICE_URL = "";
  const LOCAL_LOGIN_ENABLED =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname.includes(
      "applicationstudio.cloud.sap"
    );

  return Controller.extend("asset.management.ui.controller.App", {

    onInit: function () {
      SERVICE_URL = IS_WORK_ZONE_RUNTIME
        ? String(
            this.getOwnerComponent()
              .getManifestObject()
              .resolveUri("odata/v4/asset")
          ).replace(/\/$/, "")
        : "/odata/v4/asset";


      const model = new JSONModel({
        busy: false,
        isWorkZoneRuntime: IS_WORK_ZONE_RUNTIME,


        user: {
          id: "",
          isEmployee: false,
          isHRApprover: false,
          isApprover: false,
          isAdmin: false,
          canCreate: false,
          canApprove: false,
          canViewEmployees: false,
          canManageEmployees: false,
          canManageAssets: false
        },

        assets: [],
        employees: [],
        requests: [],
        counts: {
          assets: 0,
          available: 0,
          assigned: 0,
          employees: 0,
          requests: 0
        }
      });

      model.setSizeLimit(1000);
      this.getView().setModel(model, "vm");

      if (LOCAL_LOGIN_ENABLED) {
        this._initializeLocalLogin();
      } else {
        this._loadAll();
      }
    },



    _initializeLocalLogin: function () {
      this._authHeader = null;
      this._openLoginDialog();
    },

    _setLocalCredentials: function (username, password) {
      this._authHeader =
        "Basic " + btoa(`${username}:${password}`);
    },

    _clearLocalCredentials: function () {
      this._authHeader = null;
    },

    _validateLocalLogin: async function () {
      const response = await this._request(
        `${SERVICE_URL}/getCurrentUser()`
      );

      const currentUser =
        response?.value || response || {};

      if (
        !currentUser.id ||
        currentUser.id === "anonymous"
      ) {
        throw new Error(
          "Authentication did not return a valid user."
        );
      }

      return currentUser;
    },

    _openLoginDialog: function () {
      if (!this._loginDialog) {
        this._loginUsernameInput = new Input({
          width: "100%",
          placeholder: "Enter username, for example employee1@company.com"
        });

        this._loginPasswordInput = new Input({
          width: "100%",
          type: "Password",
          placeholder: "Enter password"
        });

        this._loginPasswordInput.setLayoutData(
          new FlexItemData({
            growFactor: 1
          })
        );

        this._togglePasswordButton = new Button({
          icon: "sap-icon://show",
          type: "Transparent",
          tooltip: "Show password",
          press: this.onTogglePasswordVisibility.bind(this)
        });

        const passwordBox = new HBox({
          width: "100%",
          alignItems: "Center",
          items: [
            this._loginPasswordInput,
            this._togglePasswordButton
          ]
        });

        this._loginDialog = new Dialog({
          title: "Local Development Login",
          contentWidth: "31rem",

          escapeHandler: function (promise) {
            promise.reject();
          },

          content: [
            new VBox({
              items: [
                new Label({
                  text: "Username",
                  required: true
                }),

                this._loginUsernameInput,

                new Label({
                  text: "Password",
                  required: true
                }).addStyleClass(
                  "sapUiSmallMarginTop"
                ),

                passwordBox
              ]
            }).addStyleClass("sapUiSmallMargin")
          ],

          beginButton: new Button({
            text: "Sign In",
            type: "Emphasized",
            press: this._applyLocalLogin.bind(this)
          })
        });

        this.getView().addDependent(
          this._loginDialog
        );
      }

      // Always open with blank credentials.
      this._loginUsernameInput.setValue("");
      this._loginPasswordInput.setValue("");

      this._loginPasswordVisible = false;

      this._loginPasswordInput.setType(
        "Password"
      );

      this._togglePasswordButton.setIcon(
        "sap-icon://show"
      );

      this._togglePasswordButton.setTooltip(
        "Show password"
      );

      this._loginDialog.open();

      setTimeout(() => {
        this._loginUsernameInput.focus();
      }, 0);
    },

    onTogglePasswordVisibility: function () {
      this._loginPasswordVisible =
        !this._loginPasswordVisible;

      this._loginPasswordInput.setType(
        this._loginPasswordVisible
          ? "Text"
          : "Password"
      );

      this._togglePasswordButton.setIcon(
        this._loginPasswordVisible
          ? "sap-icon://hide"
          : "sap-icon://show"
      );

      this._togglePasswordButton.setTooltip(
        this._loginPasswordVisible
          ? "Hide password"
          : "Show password"
      );
    },

    _applyLocalLogin: async function () {
      const username =
        this._loginUsernameInput
          .getValue()
          .trim();

      const password =
        this._loginPasswordInput.getValue();

      if (!username) {
        MessageBox.error(
          "Please enter the username."
        );

        this._loginUsernameInput.focus();
        return;
      }

      if (!password) {
        MessageBox.error(
          "Please enter the password."
        );

        this._loginPasswordInput.focus();
        return;
      }

      try {
        this._loginDialog.setBusy(true);

        this._setLocalCredentials(
          username,
          password
        );

        const currentUser =
          await this._validateLocalLogin();

        this._loginDialog.close();

        MessageToast.show(
          `Signed in as ${currentUser.id}`
        );

        await this._loadAll();

      } catch (error) {
        this._clearLocalCredentials();

        this._loginPasswordInput.setValue("");

        MessageBox.error(
          "Login failed. Check the username and password.\\n\\n" +
          error.message
        );
      } finally {
        this._loginDialog.setBusy(false);
      }
    },

onSwitchUser: function () {
  if (IS_WORK_ZONE_RUNTIME) {
    MessageToast.show(
      "Use the Work Zone profile menu to sign out."
    );
    return;
  }

  if (!LOCAL_LOGIN_ENABLED) {
    window.location.replace("/logout");
    return;
  }

  this._clearLocalCredentials();

  const model =
    this.getView().getModel("vm");

      model.setProperty("/user", {
        id: "",
        isEmployee: false,
        isHRApprover: false,
        isApprover: false,
        isAdmin: false,
        canCreate: false,
        canApprove: false,
        canViewEmployees: false,
        canManageEmployees: false,
        canManageAssets: false
      });

      model.setProperty("/assets", []);
      model.setProperty("/requests", []);
      model.setProperty("/employees", []);

      model.setProperty("/counts", {
        assets: 0,
        available: 0,
        assigned: 0,
        employees: 0,
        requests: 0
      });

      this._openLoginDialog();
    },

        _fetchCsrfToken: async function () {
      const headers = {
        "Accept": "application/json",
        "X-CSRF-Token": "Fetch"
      };

      if (this._authHeader) {
        headers.Authorization = this._authHeader;
      }

      const response = await fetch(`${SERVICE_URL}/`, {
        method: "GET",
        headers: headers,
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error(
          `Unable to fetch CSRF token. HTTP ${response.status}`
        );
      }

      const token = response.headers.get("x-csrf-token");

      if (!token) {
        throw new Error(
          "The application router did not return a CSRF token."
        );
      }

      return token;
    },

    _request: async function (url, options) {
      const requestOptions = options || {};
      const method = (
        requestOptions.method || "GET"
      ).toUpperCase();

      const headers = Object.assign(
        {
          "Accept": "application/json"
        },
        requestOptions.body
          ? { "Content-Type": "application/json" }
          : {},
        requestOptions.headers || {}
      );

      if (this._authHeader) {
        headers.Authorization = this._authHeader;
      }

      const modifyingRequest = ![
        "GET",
        "HEAD",
        "OPTIONS"
      ].includes(method);

      if (modifyingRequest) {
        headers["X-CSRF-Token"] =
          await this._fetchCsrfToken();
      }

      const response = await fetch(
        url,
        Object.assign({}, requestOptions, {
          method: method,
          headers: headers,
          credentials: "same-origin"
        })
      );

      const rawText = await response.text();
      let result = null;

      if (rawText) {
        try {
          result = JSON.parse(rawText);
        } catch {
          result = rawText;
        }
      }

      if (!response.ok) {
        const message =
          result?.error?.message ||
          result?.message ||
          rawText ||
          `HTTP ${response.status}`;

        throw new Error(message);
      }

      return result;
    },

    _loadAll: async function () {
      const model = this.getView().getModel("vm");
      model.setProperty("/busy", true);

      try {
        const [
          userResponse,
          assetsResponse,
          employeesResponse,
          requestsResponse
        ] = await Promise.all([
            this._request(
              `${SERVICE_URL}/getCurrentUser()`
            ),
            this._request(
              `${SERVICE_URL}/Assets?$expand=assignedTo&$orderby=assetTag`
            ),
            this._request(
              `${SERVICE_URL}/Employees?$orderby=fullName`
            ),
            this._request(
              `${SERVICE_URL}/AssetRequests?$expand=asset,requester,targetEmployee&$orderby=ID%20asc`
            )
          ]);

        const assets = assetsResponse?.value || [];
        const employees = employeesResponse?.value || [];
        const requests = requestsResponse?.value || [];

        const currentUser = userResponse?.value || userResponse || {};

        const user = {
          id: currentUser.id || "unknown",
          isEmployee: Boolean(currentUser.isEmployee),
          isHRApprover: Boolean(currentUser.isHRApprover),
          isApprover: Boolean(currentUser.isApprover),
          isAdmin: Boolean(currentUser.isAdmin)
        };

        user.canCreate =
          user.isEmployee ||
          user.isHRApprover ||
          user.isAdmin;

        user.canApprove =
          user.isApprover ||
          user.isAdmin;

        user.canViewEmployees =
          user.isHRApprover ||
          user.isAdmin;

        user.canManageEmployees =
          user.isAdmin;  

        user.canManageAssets =
          user.isAdmin;  

        model.setProperty("/user", user);
        model.setProperty("/assets", assets);
        model.setProperty("/employees", employees);
        model.setProperty("/requests", requests);

        model.setProperty("/counts", {
          assets: assets.length,
          available: assets.filter(
            asset => asset.status === "AVAILABLE"
          ).length,
          assigned: assets.filter(
            asset => asset.status === "ASSIGNED"
          ).length,
          employees: employees.length,
          requests: requests.length
        });

      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        model.setProperty("/busy", false);
      }
    },

    onRefresh: function () {
      this._loadAll();
    },

    formatStatusState: function (status) {
      const states = {
        AVAILABLE: "Success",
        ASSIGNED: "Information",
        MAINTENANCE: "Warning",
        RETIRED: "None",
        DRAFT: "None",
        SUBMITTED: "Information",
        APPROVED: "Success",
        REJECTED: "Error"
      };

      return states[status] || "None";
    },

    onOpenCreateRequest: function () {
      if (!this._createDialog) {
        this._buildCreateDialog();
      }

      const model = this.getView().getModel("vm");

      this._configureRequestTypesForCurrentUser();

      const activeEmployees = model
        .getProperty("/employees")
        .filter(employee => employee.active !== false);

      this._fillEmployeeSelect(
        this._requesterSelect,
        activeEmployees
      );

      const currentUser = model.getProperty("/user") || {};

      this._requestTypeSelect.setSelectedKey(
        currentUser.isEmployee ? "RETURN" : "ASSIGN"
      );
      this._reasonInput.setValue("");

      this._updateRequestDialogRules();

      this._createDialog.open();
    },

    _configureRequestTypesForCurrentUser: function () {
      const model = this.getView().getModel("vm");
      const user = model.getProperty("/user") || {};

      const requestTypes = user.isEmployee
        ? [
            { key: "RETURN", text: "Return" },
            { key: "UPDATE", text: "Update" }
          ]
        : [
            { key: "ASSIGN", text: "Assign" },
            { key: "TRANSFER", text: "Transfer" },
            { key: "RETURN", text: "Return" },
            { key: "UPDATE", text: "Update" }
          ];

      this._requestTypeSelect.removeAllItems();

      requestTypes.forEach(requestType => {
        this._requestTypeSelect.addItem(
          new Item({
            key: requestType.key,
            text: requestType.text
          })
        );
      });
    },

    _buildCreateDialog: function () {
      this._requestTypeSelect = new Select({
        width: "100%",
        change: this.onRequestTypeChange.bind(this),
        items: [
          new Item({ key: "ASSIGN", text: "Assign" }),
          new Item({ key: "TRANSFER", text: "Transfer" }),
          new Item({ key: "RETURN", text: "Return" }),
          new Item({ key: "UPDATE", text: "Update" })
        ]
      });

      this._assetSelect = new Select({
        width: "100%",
        change: this.onRequestAssetChange.bind(this)
      });

      this._assetAvailabilityLabel = new Label({
        text: "",
        visible: false,
        wrapping: true
      }).addStyleClass("sapUiTinyMarginTop");

      this._requesterSelect = new Select({
        width: "100%"
      });

      this._targetLabel = new Label({
        text: "Target Employee",
        required: true
      });

      this._targetEmployeeSelect = new Select({
        width: "100%"
      });

      this._reasonInput = new TextArea({
        width: "100%",
        rows: 4,
        maxLength: 500,
        placeholder: "Enter the business reason"
      });

      const contentBox = new VBox({
        items: [
          new Label({
            text: "Request Type",
            required: true
          }),
          this._requestTypeSelect,

          new Label({
            text: "Asset",
            required: true
          }).addStyleClass("sapUiSmallMarginTop"),
          this._assetSelect,
          this._assetAvailabilityLabel,

          new Label({
            text: "Requester",
            required: true
          }).addStyleClass("sapUiSmallMarginTop"),
          this._requesterSelect,

          this._targetLabel.addStyleClass("sapUiSmallMarginTop"),
          this._targetEmployeeSelect,

          new Label({
            text: "Reason",
            required: true
          }).addStyleClass("sapUiSmallMarginTop"),
          this._reasonInput
        ]
      }).addStyleClass("sapUiSmallMargin");

      this._createDialog = new Dialog({
        title: "Create Asset Request",
        contentWidth: "34rem",
        content: [contentBox],

        beginButton: new Button({
          text: "Create Draft",
          type: "Emphasized",
          press: this._createAssetRequest.bind(this)
        }),

        endButton: new Button({
          text: "Cancel",
          press: () => this._createDialog.close()
        })
      });

      this.getView().addDependent(this._createDialog);
    },

    onRequestTypeChange: function () {
      this._updateRequestDialogRules();
    },

    onRequestAssetChange: function () {
      this._syncReturnRequester();
      this._updateTargetEmployees();
    },

    _updateRequestDialogRules: function () {
      const model = this.getView().getModel("vm");
      const assets = model.getProperty("/assets");
      const requestType = this._requestTypeSelect.getSelectedKey();

      let eligibleAssets;

      switch (requestType) {
        case "ASSIGN":
          eligibleAssets = assets.filter(
            asset => asset.status === "AVAILABLE"
          );
          break;

        case "TRANSFER":
        case "RETURN":
          eligibleAssets = assets.filter(
            asset => asset.status === "ASSIGNED"
          );
          break;

        case "UPDATE":
          eligibleAssets = assets;
          break;

        default:
          eligibleAssets = [];
      }

      this._fillAssetSelect(
        this._assetSelect,
        eligibleAssets
      );

      const hasEligibleAssets =
        eligibleAssets.length > 0;

      if (this._assetAvailabilityLabel) {
        this._assetAvailabilityLabel.setVisible(
          !hasEligibleAssets
        );

        this._assetAvailabilityLabel.setText(
          requestType === "ASSIGN"
            ? "No AVAILABLE assets are currently available for assignment. Select another request type or make an asset available."
            : `No eligible assets are currently available for ${requestType}.`
        );
      }

      if (this._createDialog) {
        this._createDialog
          .getBeginButton()
          .setEnabled(hasEligibleAssets);
      }

      const targetRequired =
        requestType === "ASSIGN" ||
        requestType === "TRANSFER";

      this._targetLabel.setVisible(targetRequired);
      this._targetEmployeeSelect.setVisible(targetRequired);

      const currentUser =
        model.getProperty("/user") || {};

      this._requesterSelect.setEnabled(
        !currentUser.isEmployee &&
        requestType !== "RETURN"
      );

      this._syncReturnRequester();
      this._updateTargetEmployees();
    },

    _fillAssetSelect: function (select, assets) {
      select.removeAllItems();

      assets.forEach(asset => {
        select.addItem(new Item({
          key: String(asset.ID),
          text:
            `${asset.assetTag} - ${asset.assetType} (${asset.status})`
        }));
      });

      if (assets.length > 0) {
        select.setSelectedKey(String(assets[0].ID));
      }
    },

    _fillEmployeeSelect: function (select, employees) {
      select.removeAllItems();

      employees.forEach(employee => {
        select.addItem(new Item({
          key: String(employee.ID),
          text:
            `${employee.fullName} (${employee.employeeNo})`
        }));
      });

      if (employees.length > 0) {
        select.setSelectedKey(String(employees[0].ID));
      }
    },

    _syncReturnRequester: function () {
      const requestType =
        this._requestTypeSelect.getSelectedKey();

      if (requestType !== "RETURN") {
        return;
      }

      const asset = this._getSelectedDialogAsset();

      if (!asset) {
        this._requesterSelect.setSelectedKey("");
        return;
      }

      const assignedEmployeeId =
        asset.assignedTo_ID ||
        asset.assignedTo?.ID;

      if (assignedEmployeeId) {
        this._requesterSelect.setSelectedKey(
          String(assignedEmployeeId)
        );
      }
    },

    _updateTargetEmployees: function () {
      const model = this.getView().getModel("vm");

      const activeEmployees = model
        .getProperty("/employees")
        .filter(employee => employee.active !== false);

      const requestType =
        this._requestTypeSelect.getSelectedKey();

      const selectedAsset =
        this._getSelectedDialogAsset();

      let targetEmployees = activeEmployees;

      if (
        requestType === "TRANSFER" &&
        selectedAsset
      ) {
        const currentAssigneeId =
          selectedAsset.assignedTo_ID ||
          selectedAsset.assignedTo?.ID;

        targetEmployees = activeEmployees.filter(
          employee => employee.ID !== currentAssigneeId
        );
      }

      this._fillEmployeeSelect(
        this._targetEmployeeSelect,
        targetEmployees
      );
    },

    _getSelectedDialogAsset: function () {
      const assetId = Number(
        this._assetSelect.getSelectedKey()
      );

      return this.getView()
        .getModel("vm")
        .getProperty("/assets")
        .find(asset => asset.ID === assetId);
    },

    _createAssetRequest: async function () {
      const requestType =
        this._requestTypeSelect.getSelectedKey();

      const assetId = Number(
        this._assetSelect.getSelectedKey()
      );

      const requesterId = Number(
        this._requesterSelect.getSelectedKey()
      );

      const targetEmployeeId = Number(
        this._targetEmployeeSelect.getSelectedKey()
      );

      const reason =
        this._reasonInput.getValue().trim();

      if (!assetId) {
        MessageBox.error(
          `No eligible asset is available for ${requestType}.`
        );
        return;
      }

      if (!requesterId) {
        MessageBox.error("Please select a requester.");
        return;
      }

      if (!reason) {
        MessageBox.error("Please enter a reason.");
        return;
      }

      const targetRequired =
        requestType === "ASSIGN" ||
        requestType === "TRANSFER";

      if (targetRequired && !targetEmployeeId) {
        MessageBox.error(
          "Please select a target employee."
        );
        return;
      }

      const payload = {
        requestType: requestType,
        asset_ID: assetId,
        requester_ID: requesterId,
        targetEmployee_ID:
          targetRequired ? targetEmployeeId : null,
        reason: reason,
        status: "DRAFT"
      };

      try {
        this._createDialog.setBusy(true);

        await this._request(
          `${SERVICE_URL}/AssetRequests`,
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );

        this._createDialog.close();
        MessageToast.show("Draft request created");

        await this._loadAll();

      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        this._createDialog.setBusy(false);
      }
    },

    onSubmitRequest: function (event) {
      const request = event
        .getSource()
        .getBindingContext("vm")
        .getObject();

      MessageBox.confirm(
        `Submit request ${request.ID}?`,
        {
          title: "Submit Request",
          emphasizedAction: MessageBox.Action.OK,

          onClose: async action => {
            if (action !== MessageBox.Action.OK) {
              return;
            }

            try {
              await this._executeAction(
                request.ID,
                "submitRequest",
                {}
              );

              MessageToast.show(
                `Request ${request.ID} submitted`
              );

              await this._loadAll();

            } catch (error) {
              MessageBox.error(error.message);
            }
          }
        }
      );
    },


        onEditAsset: function (event) {
      const asset = event
        .getSource()
        .getBindingContext("vm")
        .getObject();

      const assetTagInput = new Input({
        value: asset.assetTag || "",
        required: true,
        width: "100%"
      });

      const assetTypeInput = new Input({
        value: asset.assetType || "",
        required: true,
        width: "100%"
      });

      const brandInput = new Input({
        value: asset.brand || "",
        width: "100%"
      });

      const modelInput = new Input({
        value: asset.model || "",
        width: "100%"
      });

      const serialNumberInput = new Input({
        value: asset.serialNumber || "",
        width: "100%"
      });

      const locationInput = new Input({
        value: asset.location || "",
        width: "100%"
      });

      const assetValueInput = new Input({
        value:
          asset.assetValue === null ||
          asset.assetValue === undefined
            ? ""
            : String(asset.assetValue),
        type: "Number",
        width: "100%"
      });

      const currencyInput = new Input({
        value: asset.currency || "INR",
        maxLength: 3,
        width: "100%"
      });

      const notesInput = new TextArea({
        value: asset.notes || "",
        width: "100%",
        rows: 3
      });

      const dialog = new Dialog({
        title: `Edit Asset - ${asset.assetTag}`,
        contentWidth: "32rem",
        horizontalScrolling: false,
        verticalScrolling: true,

        content: [
          new VBox({
            width: "100%",
            items: [
              new Label({
                text: "Asset Tag",
                required: true
              }),
              assetTagInput,

              new Label({
                text: "Asset Type",
                required: true
              }).addStyleClass("sapUiSmallMarginTop"),
              assetTypeInput,

              new Label({
                text: "Brand"
              }).addStyleClass("sapUiSmallMarginTop"),
              brandInput,

              new Label({
                text: "Model"
              }).addStyleClass("sapUiSmallMarginTop"),
              modelInput,

              new Label({
                text: "Serial Number"
              }).addStyleClass("sapUiSmallMarginTop"),
              serialNumberInput,

              new Label({
                text: "Location"
              }).addStyleClass("sapUiSmallMarginTop"),
              locationInput,

              new Label({
                text: "Asset Value"
              }).addStyleClass("sapUiSmallMarginTop"),
              assetValueInput,

              new Label({
                text: "Currency"
              }).addStyleClass("sapUiSmallMarginTop"),
              currencyInput,

              new Label({
                text: "Notes"
              }).addStyleClass("sapUiSmallMarginTop"),
              notesInput
            ]
          }).addStyleClass("sapUiSmallMargin")
        ],

        beginButton: new Button({
          text: "Save",
          type: "Emphasized",

          press: async () => {
            const assetTag =
              assetTagInput.getValue().trim();

            const assetType =
              assetTypeInput.getValue().trim();

            const assetValueText =
              assetValueInput.getValue().trim();

            const currency =
              currencyInput.getValue()
                .trim()
                .toUpperCase();

            if (!assetTag || !assetType) {
              MessageBox.error(
                "Asset Tag and Asset Type are required."
              );
              return;
            }

            if (currency.length !== 3) {
              MessageBox.error(
                "Currency must contain exactly 3 characters."
              );
              return;
            }

            if (
              assetValueText &&
              (
                !Number.isFinite(Number(assetValueText)) ||
                Number(assetValueText) < 0
              )
            ) {
              MessageBox.error(
                "Asset Value must be a valid non-negative number."
              );
              return;
            }

            const payload = {
              assetTag: assetTag,
              assetType: assetType,
              brand:
                brandInput.getValue().trim() ||
                null,
              model:
                modelInput.getValue().trim() ||
                null,
              serialNumber:
                serialNumberInput
                  .getValue()
                  .trim() || null,
              location:
                locationInput.getValue().trim() ||
                null,
              assetValue:
                assetValueText
                  ? Number(assetValueText)
                  : null,
              currency: currency,
              notes:
                notesInput.getValue().trim() ||
                null
            };

            try {
              dialog.setBusy(true);

              await this._request(
                `${SERVICE_URL}/Assets(${asset.ID})`,
                {
                  method: "PATCH",
                  headers: {
                    "If-Match": "*"
                  },
                  body: JSON.stringify(payload)
                }
              );

              dialog.close();

              MessageToast.show(
                "Asset updated successfully"
              );

              await this._loadAll();

            } catch (error) {
              MessageBox.error(error.message);
            } finally {
              dialog.setBusy(false);
            }
          }
        }),

        endButton: new Button({
          text: "Cancel",
          press: function () {
            dialog.close();
          }
        }),

        afterClose: function () {
          dialog.destroy();
        }
      });

      this.getView().addDependent(dialog);
      dialog.open();
    },

        onCreateAsset: function () {
      const assetTagInput = new Input({
        required: true,
        width: "100%",
        placeholder: "Example: AST-1007"
      });

      const assetTypeInput = new Input({
        required: true,
        width: "100%",
        placeholder: "Example: Laptop"
      });

      const brandInput = new Input({
        width: "100%",
        placeholder: "Example: Dell"
      });

      const modelInput = new Input({
        width: "100%",
        placeholder: "Example: Latitude 5450"
      });

      const serialNumberInput = new Input({
        width: "100%",
        placeholder: "Example: SN-DL-1007"
      });

      const locationInput = new Input({
        width: "100%",
        placeholder: "Example: Pune"
      });

      const assetValueInput = new Input({
        type: "Number",
        width: "100%",
        placeholder: "Example: 75000"
      });

      const currencyInput = new Input({
        value: "INR",
        maxLength: 3,
        width: "100%"
      });

      const notesInput = new TextArea({
        width: "100%",
        rows: 3,
        placeholder: "Optional asset notes"
      });

      const dialog = new Dialog({
        title: "Create Asset",
        contentWidth: "32rem",
        horizontalScrolling: false,
        verticalScrolling: true,

        content: [
          new VBox({
            width: "100%",
            items: [
              new Label({
                text: "Asset Tag",
                required: true
              }),
              assetTagInput,

              new Label({
                text: "Asset Type",
                required: true
              }).addStyleClass("sapUiSmallMarginTop"),
              assetTypeInput,

              new Label({
                text: "Brand"
              }).addStyleClass("sapUiSmallMarginTop"),
              brandInput,

              new Label({
                text: "Model"
              }).addStyleClass("sapUiSmallMarginTop"),
              modelInput,

              new Label({
                text: "Serial Number"
              }).addStyleClass("sapUiSmallMarginTop"),
              serialNumberInput,

              new Label({
                text: "Location"
              }).addStyleClass("sapUiSmallMarginTop"),
              locationInput,

              new Label({
                text: "Asset Value"
              }).addStyleClass("sapUiSmallMarginTop"),
              assetValueInput,

              new Label({
                text: "Currency"
              }).addStyleClass("sapUiSmallMarginTop"),
              currencyInput,

              new Label({
                text: "Notes"
              }).addStyleClass("sapUiSmallMarginTop"),
              notesInput
            ]
          }).addStyleClass("sapUiSmallMargin")
        ],

        beginButton: new Button({
          text: "Create",
          type: "Emphasized",

          press: async () => {
            const assetTag =
              assetTagInput.getValue().trim();

            const assetType =
              assetTypeInput.getValue().trim();

            const brand =
              brandInput.getValue().trim();

            const model =
              modelInput.getValue().trim();

            const serialNumber =
              serialNumberInput.getValue().trim();

            const location =
              locationInput.getValue().trim();

            const assetValueText =
              assetValueInput.getValue().trim();

            const currency =
              currencyInput.getValue()
                .trim()
                .toUpperCase();

            const notes =
              notesInput.getValue().trim();

            if (!assetTag || !assetType) {
              MessageBox.error(
                "Asset Tag and Asset Type are required."
              );
              return;
            }

            if (currency.length !== 3) {
              MessageBox.error(
                "Currency must contain exactly 3 characters."
              );
              return;
            }

            if (
              assetValueText &&
              (
                !Number.isFinite(Number(assetValueText)) ||
                Number(assetValueText) < 0
              )
            ) {
              MessageBox.error(
                "Asset Value must be a valid non-negative number."
              );
              return;
            }

            const payload = {
              assetTag: assetTag,
              assetType: assetType,
              brand: brand || null,
              model: model || null,
              serialNumber: serialNumber || null,
              location: location || null,
              assetValue:
                assetValueText
                  ? Number(assetValueText)
                  : null,
              currency: currency,
              notes: notes || null
            };

            try {
              dialog.setBusy(true);

              await this._request(
                `${SERVICE_URL}/Assets`,
                {
                  method: "POST",
                  body: JSON.stringify(payload)
                }
              );

              dialog.close();

              MessageToast.show(
                "Asset created successfully"
              );

              await this._loadAll();

            } catch (error) {
              MessageBox.error(error.message);
            } finally {
              dialog.setBusy(false);
            }
          }
        }),

        endButton: new Button({
          text: "Cancel",
          press: function () {
            dialog.close();
          }
        }),

        afterClose: function () {
          dialog.destroy();
        }
      });

      this.getView().addDependent(dialog);
      dialog.open();
    },

        onCreateEmployee: function () {
      const employeeNoInput = new Input({
        required: true,
        width: "100%",
        placeholder: "Example: E1004"
      });

      const fullNameInput = new Input({
        required: true,
        width: "100%",
        placeholder: "Employee full name"
      });

      const emailInput = new Input({
        required: true,
        type: "Email",
        width: "100%",
        placeholder: "employee@company.com"
      });

      const departmentInput = new Input({
        width: "100%",
        placeholder: "Department"
      });

      const managerEmailInput = new Input({
        type: "Email",
        width: "100%",
        placeholder: "manager@company.com"
      });

      const dialog = new Dialog({
        title: "Create Employee",
        contentWidth: "30rem",
        horizontalScrolling: false,
        verticalScrolling: true,

        content: [
          new VBox({
            width: "100%",
            items: [
              new Label({
                text: "Employee Number",
                required: true
              }),
              employeeNoInput,

              new Label({
                text: "Full Name",
                required: true
              }).addStyleClass("sapUiSmallMarginTop"),
              fullNameInput,

              new Label({
                text: "Email",
                required: true
              }).addStyleClass("sapUiSmallMarginTop"),
              emailInput,

              new Label({
                text: "Department"
              }).addStyleClass("sapUiSmallMarginTop"),
              departmentInput,

              new Label({
                text: "Manager Email"
              }).addStyleClass("sapUiSmallMarginTop"),
              managerEmailInput
            ]
          }).addStyleClass("sapUiSmallMargin")
        ],

        beginButton: new Button({
          text: "Create",
          type: "Emphasized",

          press: async () => {
            const employeeNo =
              employeeNoInput.getValue().trim();

            const fullName =
              fullNameInput.getValue().trim();

            const email =
              emailInput.getValue().trim();

            const department =
              departmentInput.getValue().trim();

            const managerEmail =
              managerEmailInput.getValue().trim();

            if (!employeeNo || !fullName || !email) {
              MessageBox.error(
                "Employee Number, Full Name and Email are required."
              );
              return;
            }

            const emailPattern =
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailPattern.test(email)) {
              MessageBox.error(
                "Enter a valid employee email address."
              );
              return;
            }

            if (
              managerEmail &&
              !emailPattern.test(managerEmail)
            ) {
              MessageBox.error(
                "Enter a valid manager email address."
              );
              return;
            }

            const payload = {
              employeeNo: employeeNo,
              fullName: fullName,
              email: email,
              department: department || null,
              managerEmail: managerEmail || null,
              active: true
            };

            try {
              dialog.setBusy(true);

              await this._request(
                `${SERVICE_URL}/Employees`,
                {
                  method: "POST",
                  body: JSON.stringify(payload)
                }
              );

              dialog.close();

              MessageToast.show(
                "Employee created successfully"
              );

              await this._loadAll();

            } catch (error) {
              MessageBox.error(error.message);
            } finally {
              dialog.setBusy(false);
            }
          }
        }),

        endButton: new Button({
          text: "Cancel",
          press: function () {
            dialog.close();
          }
        }),

        afterClose: function () {
          dialog.destroy();
        }
      });

      this.getView().addDependent(dialog);
      dialog.open();
    },

        onEditEmployee: function (event) {
      const employee = event
        .getSource()
        .getBindingContext("vm")
        .getObject();

      const employeeNoInput = new Input({
        value: employee.employeeNo || "",
        required: true,
        width: "100%"
      });

      const fullNameInput = new Input({
        value: employee.fullName || "",
        required: true,
        width: "100%"
      });

      const emailInput = new Input({
        value: employee.email || "",
        type: "Email",
        required: true,
        width: "100%"
      });

      const departmentInput = new Input({
        value: employee.department || "",
        width: "100%"
      });

      const managerEmailInput = new Input({
        value: employee.managerEmail || "",
        type: "Email",
        width: "100%"
      });

      const activeSelect = new Select({
        selectedKey: employee.active ? "true" : "false",
        width: "100%",
        items: [
          new Item({
            key: "true",
            text: "Active"
          }),
          new Item({
            key: "false",
            text: "Inactive"
          })
        ]
      });

      const dialog = new Dialog({
        title: `Edit Employee - ${employee.employeeNo}`,
        contentWidth: "32rem",

        content: [
          new VBox({
            width: "100%",
            items: [
              new Label({
                text: "Employee Number",
                required: true
              }),
              employeeNoInput,

              new Label({
                text: "Full Name",
                required: true
              }).addStyleClass("sapUiSmallMarginTop"),
              fullNameInput,

              new Label({
                text: "Email",
                required: true
              }).addStyleClass("sapUiSmallMarginTop"),
              emailInput,

              new Label({
                text: "Department"
              }).addStyleClass("sapUiSmallMarginTop"),
              departmentInput,

              new Label({
                text: "Manager Email"
              }).addStyleClass("sapUiSmallMarginTop"),
              managerEmailInput,

              new Label({
                text: "Status"
              }).addStyleClass("sapUiSmallMarginTop"),
              activeSelect
            ]
          }).addStyleClass("sapUiSmallMargin")
        ],

        beginButton: new Button({
          text: "Save",
          type: "Emphasized",

          press: async () => {
            const employeeNo =
              employeeNoInput.getValue().trim();

            const fullName =
              fullNameInput.getValue().trim();

            const email =
              emailInput.getValue().trim();

            const department =
              departmentInput.getValue().trim();

            const managerEmail =
              managerEmailInput.getValue().trim();

            if (!employeeNo || !fullName || !email) {
              MessageBox.error(
                "Employee Number, Full Name and Email are required."
              );
              return;
            }

            const emailPattern =
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!emailPattern.test(email)) {
              MessageBox.error(
                "Enter a valid employee email address."
              );
              return;
            }

            if (
              managerEmail &&
              !emailPattern.test(managerEmail)
            ) {
              MessageBox.error(
                "Enter a valid manager email address."
              );
              return;
            }

            const payload = {
              employeeNo: employeeNo,
              fullName: fullName,
              email: email,
              department: department || null,
              managerEmail: managerEmail || null,
              active:
                activeSelect.getSelectedKey() === "true"
            };

            try {
              dialog.setBusy(true);

              await this._request(
                `${SERVICE_URL}/Employees(${employee.ID})`,
                {
                  method: "PATCH",
                  headers: {
                    "If-Match": "*"
                  },
                  body: JSON.stringify(payload)
                }
              );

              dialog.close();

              MessageToast.show(
                "Employee updated successfully"
              );

              await this._loadAll();

            } catch (error) {
              MessageBox.error(error.message);
            } finally {
              dialog.setBusy(false);
            }
          }
        }),

        endButton: new Button({
          text: "Cancel",
          press: function () {
            dialog.close();
          }
        }),

        afterClose: function () {
          dialog.destroy();
        }
      });

      this.getView().addDependent(dialog);
      dialog.open();
    },

    onDeleteRequest: function (event) {
      const request = event
        .getSource()
        .getBindingContext("vm")
        .getObject();

      MessageBox.confirm(
        `Delete draft request ${request.ID}?`,
        {
          title: "Delete Draft",
          emphasizedAction: MessageBox.Action.DELETE,

          onClose: async action => {
            if (action !== MessageBox.Action.DELETE) {
              return;
            }

            try {
              await this._request(
                `${SERVICE_URL}/AssetRequests(${request.ID})`,
                {
                  method: "DELETE"
                }
              );

              MessageToast.show(
                `Draft request ${request.ID} deleted`
              );

              await this._loadAll();

            } catch (error) {
              MessageBox.error(error.message);
            }
          }
        }
      );
    },

    onApproveRequest: function (event) {
      const request = event
        .getSource()
        .getBindingContext("vm")
        .getObject();

      this._openDecisionDialog(
        request,
        "approveRequest",
        false
      );
    },

    onRejectRequest: function (event) {
      const request = event
        .getSource()
        .getBindingContext("vm")
        .getObject();

      this._openDecisionDialog(
        request,
        "rejectRequest",
        true
      );
    },

    _openDecisionDialog: function (
      request,
      actionName,
      commentRequired
    ) {
      const commentInput = new TextArea({
        width: "100%",
        rows: 4,
        maxLength: 500,
        placeholder: commentRequired
          ? "Enter rejection reason"
          : "Enter approval comment"
      });

      const isApproval =
        actionName === "approveRequest";

      const dialog = new Dialog({
        title: isApproval
          ? `Approve Request ${request.ID}`
          : `Reject Request ${request.ID}`,

        contentWidth: "30rem",

        content: [
          new VBox({
            items: [
              new Label({
                text: "Decision Comment",
                required: commentRequired
              }),
              commentInput
            ]
          }).addStyleClass("sapUiSmallMargin")
        ],

        beginButton: new Button({
          text: isApproval ? "Approve" : "Reject",
          type: isApproval ? "Accept" : "Reject",

          press: async () => {
            const comment =
              commentInput.getValue().trim();

            if (commentRequired && !comment) {
              MessageBox.error(
                "A rejection comment is required."
              );
              return;
            }

            try {
              dialog.setBusy(true);

              await this._executeAction(
                request.ID,
                actionName,
                {
                  decisionComment: comment
                }
              );

              dialog.close();

              MessageToast.show(
                isApproval
                  ? `Request ${request.ID} approved`
                  : `Request ${request.ID} rejected`
              );

              await this._loadAll();

            } catch (error) {
              MessageBox.error(error.message);
            } finally {
              dialog.setBusy(false);
            }
          }
        }),

        endButton: new Button({
          text: "Cancel",
          press: () => dialog.close()
        }),

        afterClose: function () {
          dialog.destroy();
        }
      });

      this.getView().addDependent(dialog);
      dialog.open();
    },

    _executeAction: function (
      requestId,
      actionName,
      payload
    ) {
      return this._request(
        `${SERVICE_URL}/AssetRequests(${requestId})/AssetService.${actionName}`,
        {
          method: "POST",
          body: JSON.stringify(payload || {})
        }
      );
    }

  });
});
