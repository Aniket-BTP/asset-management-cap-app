const cds = require("@sap/cds");

const { SELECT, UPDATE } = cds.ql;

module.exports = class AssetService extends cds.ApplicationService {
  async init() {
    const { AssetRequests, Assets, Employees } = this.entities;

    /**
     * Returns the key of the selected AssetRequests record.
     */
    const getRequestId = (req) => {
      const requestId = req.params?.[0]?.ID;

      if (requestId === undefined || requestId === null) {
        req.reject(400, "Asset request ID was not provided.");
      }

      return requestId;
    };


    /**
     * Requires at least one of the supplied application roles.
     */
    const requireAnyRole = (req, roles, operation) => {
      const authorized =
        req.user &&
        roles.some((role) => req.user.is(role));

      if (!authorized) {
        req.reject(
          403,
          `${operation} requires one of these roles: ${roles.join(", ")}.`
        );
      }
    };

    /**
     * Reads the complete request and validates that it exists.
     */
    const readAssetRequest = async (tx, requestId, req) => {
      const assetRequest = await tx.run(
        SELECT.one.from(AssetRequests).where({ ID: requestId })
      );

      if (!assetRequest) {
        req.reject(404, `Asset request ${requestId} was not found.`);
      }

      return assetRequest;
    };

    /**
     * Reads the related asset and validates that it exists.
     */
    const readAsset = async (tx, assetId, req) => {
      if (!assetId) {
        req.reject(400, "The request does not contain an asset.");
      }

      const asset = await tx.run(
        SELECT.one.from(Assets).where({ ID: assetId })
      );

      if (!asset) {
        req.reject(404, `Asset ${assetId} was not found.`);
      }

      return asset;
    };

    /**
     * Reads an employee and ensures that the employee is active.
     */
    const readActiveEmployee = async (tx, employeeId, req, description) => {
      if (!employeeId) {
        req.reject(400, `${description} is required.`);
      }

      const employee = await tx.run(
        SELECT.one.from(Employees).where({ ID: employeeId })
      );

      if (!employee) {
        req.reject(404, `${description} ${employeeId} was not found.`);
      }

      if (!employee.active) {
        req.reject(400, `${description} ${employee.fullName} is inactive.`);
      }

      return employee;
    };

    /**
     * Validates the request before it is submitted.
     */
    const validateForSubmission = async (tx, assetRequest, req) => {
      const validRequestTypes = ["ASSIGN", "TRANSFER", "RETURN", "UPDATE"];

      if (!validRequestTypes.includes(assetRequest.requestType)) {
        req.reject(
          400,
          `Unsupported request type: ${assetRequest.requestType}.`
        );
      }

      await readActiveEmployee(
        tx,
        assetRequest.requester_ID,
        req,
        "Requester"
      );

      const asset = await readAsset(tx, assetRequest.asset_ID, req);

      switch (assetRequest.requestType) {
        case "ASSIGN": {
          await readActiveEmployee(
            tx,
            assetRequest.targetEmployee_ID,
            req,
            "Target employee"
          );

          if (asset.status !== "AVAILABLE") {
            req.reject(
              400,
              `Asset ${asset.assetTag} must be AVAILABLE before assignment.`
            );
          }

          break;
        }

        case "TRANSFER": {
          await readActiveEmployee(
            tx,
            assetRequest.targetEmployee_ID,
            req,
            "Target employee"
          );

          if (asset.status !== "ASSIGNED") {
            req.reject(
              400,
              `Asset ${asset.assetTag} must be ASSIGNED before transfer.`
            );
          }

          if (asset.assignedTo_ID === assetRequest.targetEmployee_ID) {
            req.reject(
              400,
              `Asset ${asset.assetTag} is already assigned to the target employee.`
            );
          }

          break;
        }

        case "RETURN": {
          if (asset.status !== "ASSIGNED") {
            req.reject(
              400,
              `Asset ${asset.assetTag} must be ASSIGNED before it can be returned.`
            );
          }

          if (asset.assignedTo_ID !== assetRequest.requester_ID) {
            req.reject(
              400,
              `Only the employee currently assigned to asset ${asset.assetTag} can submit its return request.`
            );
          }

          break;
        }

        case "UPDATE": {
          if (!assetRequest.reason || !assetRequest.reason.trim()) {
            req.reject(
              400,
              "A reason is required for an asset update request."
            );
          }

          break;
        }

        default:
          break;
      }
    };

          /**
     * Updates asset master data.
     * Assignment and workflow status cannot be changed directly.
     */
    this.before("UPDATE", "Assets", async (req) => {
      requireAnyRole(
        req,
        ["Admin"],
        "Updating an asset"
      );

      const tx = cds.tx(req);

      const assetId =
        req.params?.[0]?.ID ?? req.data.ID;

      if (
        assetId === undefined ||
        assetId === null
      ) {
        req.reject(
          400,
          "Asset ID was not provided."
        );
      }

      const existingAsset = await tx.run(
        SELECT.one
          .from(Assets)
          .where({ ID: assetId })
      );

      if (!existingAsset) {
        req.reject(
          404,
          `Asset ${assetId} was not found.`
        );
      }

      const assetTag = String(
        req.data.assetTag ??
        existingAsset.assetTag ??
        ""
      )
        .trim()
        .toUpperCase();

      const assetType = String(
        req.data.assetType ??
        existingAsset.assetType ??
        ""
      ).trim();

      const brand = String(
        req.data.brand ??
        existingAsset.brand ??
        ""
      ).trim();

      const assetModel = String(
        req.data.model ??
        existingAsset.model ??
        ""
      ).trim();

      const serialNumber = String(
        req.data.serialNumber ??
        existingAsset.serialNumber ??
        ""
      ).trim();

      const location = String(
        req.data.location ??
        existingAsset.location ??
        ""
      ).trim();

      const currency = String(
        req.data.currency ??
        existingAsset.currency ??
        "INR"
      )
        .trim()
        .toUpperCase();

      const notes = String(
        req.data.notes ??
        existingAsset.notes ??
        ""
      ).trim();

      if (!assetTag || !assetType) {
        req.reject(
          400,
          "Asset Tag and Asset Type are required."
        );
      }

      if (currency.length !== 3) {
        req.reject(
          400,
          "Currency must contain exactly 3 characters."
        );
      }

      const rawAssetValue =
        req.data.assetValue ??
        existingAsset.assetValue;

      const assetValue =
        rawAssetValue === undefined ||
        rawAssetValue === null ||
        rawAssetValue === ""
          ? null
          : Number(rawAssetValue);

      if (
        assetValue !== null &&
        (
          !Number.isFinite(assetValue) ||
          assetValue < 0
        )
      ) {
        req.reject(
          400,
          "Asset Value must be a valid non-negative number."
        );
      }

      const assetWithSameTag = await tx.run(
        SELECT.one
          .from(Assets)
          .columns("ID")
          .where({ assetTag: assetTag })
      );

      if (
        assetWithSameTag &&
        Number(assetWithSameTag.ID) !==
          Number(assetId)
      ) {
        req.reject(
          409,
          `Asset Tag ${assetTag} already exists.`
        );
      }

      if (serialNumber) {
        const assetWithSameSerial = await tx.run(
          SELECT.one
            .from(Assets)
            .columns("ID")
            .where({
              serialNumber: serialNumber
            })
        );

        if (
          assetWithSameSerial &&
          Number(assetWithSameSerial.ID) !==
            Number(assetId)
        ) {
          req.reject(
            409,
            `Serial Number ${serialNumber} already exists.`
          );
        }
      }

      req.data.assetTag = assetTag;
      req.data.assetType = assetType;
      req.data.brand = brand || null;
      req.data.model = assetModel || null;
      req.data.serialNumber =
        serialNumber || null;
      req.data.location = location || null;
      req.data.assetValue = assetValue;
      req.data.currency = currency;
      req.data.notes = notes || null;

      // Assignment and status changes must use the
      // request-approval workflow.
      delete req.data.status;
      delete req.data.assignedTo_ID;
      delete req.data.assignedDate;
    });

        /**
     * Creates an asset with a generated Integer ID.
     * Asset Tag and Serial Number must be unique.
     */
    this.before("CREATE", "Assets", async (req) => {
      requireAnyRole(
        req,
        ["Admin"],
        "Creating an asset"
      );

      const tx = cds.tx(req);

      const assetTag =
        String(req.data.assetTag || "")
          .trim()
          .toUpperCase();

      const assetType =
        String(req.data.assetType || "").trim();

      const brand =
        String(req.data.brand || "").trim();

      const model =
        String(req.data.model || "").trim();

      const serialNumber =
        String(req.data.serialNumber || "").trim();

      const location =
        String(req.data.location || "").trim();

      const currency =
        String(req.data.currency || "INR")
          .trim()
          .toUpperCase();

      const notes =
        String(req.data.notes || "").trim();

      if (!assetTag || !assetType) {
        req.reject(
          400,
          "Asset Tag and Asset Type are required."
        );
      }

      if (currency.length !== 3) {
        req.reject(
          400,
          "Currency must contain exactly 3 characters."
        );
      }

      const assetValue =
        req.data.assetValue === undefined ||
        req.data.assetValue === null ||
        req.data.assetValue === ""
          ? null
          : Number(req.data.assetValue);

      if (
        assetValue !== null &&
        (
          !Number.isFinite(assetValue) ||
          assetValue < 0
        )
      ) {
        req.reject(
          400,
          "Asset Value must be a valid non-negative number."
        );
      }

      const existingAssetTag = await tx.run(
        SELECT.one
          .from(Assets)
          .columns("ID")
          .where({ assetTag: assetTag })
      );

      if (existingAssetTag) {
        req.reject(
          409,
          `Asset Tag ${assetTag} already exists.`
        );
      }

      if (serialNumber) {
        const existingSerialNumber = await tx.run(
          SELECT.one
            .from(Assets)
            .columns("ID")
            .where({ serialNumber: serialNumber })
        );

        if (existingSerialNumber) {
          req.reject(
            409,
            `Serial Number ${serialNumber} already exists.`
          );
        }
      }

      if (
        req.data.ID === undefined ||
        req.data.ID === null
      ) {
        const latestAssets = await tx.run(
          SELECT.from(Assets)
            .columns("ID")
            .orderBy("ID desc")
            .limit(1)
        );

        const latestId = latestAssets.length
          ? Number(latestAssets[0].ID)
          : 0;

        req.data.ID = latestId + 1;
      }

      req.data.assetTag = assetTag;
      req.data.assetType = assetType;
      req.data.brand = brand || null;
      req.data.model = model || null;
      req.data.serialNumber = serialNumber || null;
      req.data.location = location || null;
      req.data.assetValue = assetValue;
      req.data.currency = currency;
      req.data.notes = notes || null;

      // Newly created assets start as available.
      req.data.status = "AVAILABLE";
      req.data.assignedTo_ID = null;
      req.data.assignedDate = null;
    });

        /**
     * Creates an employee with a generated Integer ID and validates
     * unique employee number and email.
     */
    this.before("CREATE", "Employees", async (req) => {
      requireAnyRole(
        req,
        ["Admin"],
        "Creating an employee"
      );

      const tx = cds.tx(req);

      const employeeNo =
        String(req.data.employeeNo || "").trim();

      const fullName =
        String(req.data.fullName || "").trim();

      const email =
        String(req.data.email || "")
          .trim()
          .toLowerCase();

      const department =
        String(req.data.department || "").trim();

      const managerEmail =
        String(req.data.managerEmail || "")
          .trim()
          .toLowerCase();

      if (!employeeNo || !fullName || !email) {
        req.reject(
          400,
          "Employee Number, Full Name and Email are required."
        );
      }

      const emailPattern =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(email)) {
        req.reject(
          400,
          "Enter a valid employee email address."
        );
      }

      if (
        managerEmail &&
        !emailPattern.test(managerEmail)
      ) {
        req.reject(
          400,
          "Enter a valid manager email address."
        );
      }

      const employeeWithSameNumber = await tx.run(
        SELECT.one
          .from(Employees)
          .columns("ID")
          .where({ employeeNo: employeeNo })
      );

      if (employeeWithSameNumber) {
        req.reject(
          409,
          `Employee Number ${employeeNo} already exists.`
        );
      }

      const employeeWithSameEmail = await tx.run(
        SELECT.one
          .from(Employees)
          .columns("ID")
          .where({ email: email })
      );

      if (employeeWithSameEmail) {
        req.reject(
          409,
          `Employee email ${email} already exists.`
        );
      }

      if (
        req.data.ID === undefined ||
        req.data.ID === null
      ) {
        const latestEmployees = await tx.run(
          SELECT.from(Employees)
            .columns("ID")
            .orderBy("ID desc")
            .limit(1)
        );

        const latestId = latestEmployees.length
          ? Number(latestEmployees[0].ID)
          : 0;

        req.data.ID = latestId + 1;
      }

      req.data.employeeNo = employeeNo;
      req.data.fullName = fullName;
      req.data.email = email;
      req.data.department = department || null;
      req.data.managerEmail = managerEmail || null;

      if (
        req.data.active === undefined ||
        req.data.active === null
      ) {
        req.data.active = true;
      }
    });

    /**
     * Validates newly created requests and prevents multiple active
     * requests for the same asset.
     */
    this.before("CREATE", "AssetRequests", async (req) => {
      requireAnyRole(
        req,
        ["Employee", "HRApprover", "Admin"],
        "Creating an asset request"
      );

      const tx = cds.tx(req);

            // Generate the next Integer request ID.
      // For a production system, prefer UUIDs or a database sequence.
      if (req.data.ID === undefined || req.data.ID === null) {
        const latestRequests = await tx.run(
          SELECT.from(AssetRequests)
            .columns("ID")
            .orderBy("ID desc")
            .limit(1)
        );

        const latestId = latestRequests.length
          ? Number(latestRequests[0].ID)
          : 0;

        req.data.ID = latestId + 1;
      }

      // Employee request ownership validation
      if (req.user?.is("Employee")) {
        const employee = await tx.run(
          SELECT.one
            .from(Employees)
            .where({ email: req.user.id })
        );

        if (!employee) {
          req.reject(
            403,
            `No employee master record exists for ${req.user.id}.`
          );
        }

        const employeeRequestTypes = ["RETURN", "UPDATE"];

        if (!employeeRequestTypes.includes(req.data.requestType)) {
          req.reject(
            403,
            "Employees can create only RETURN or UPDATE requests."
          );
        }

        // Never trust a requester supplied by the browser.
        req.data.requester_ID = employee.ID;
      }


      await validateForSubmission(tx, req.data, req);

      const requestsForAsset = await tx.run(
        SELECT.from(AssetRequests)
          .columns("ID", "status", "requestType")
          .where({ asset_ID: req.data.asset_ID })
      );

      const existingActiveRequest = requestsForAsset.find(
        (request) =>
          request.status === "DRAFT" ||
          request.status === "SUBMITTED"
      );

      if (existingActiveRequest) {
        req.reject(
          409,
          `Asset already has active request ${existingActiveRequest.ID} ` +
          `with status ${existingActiveRequest.status}.`
        );
      }
    });

    this.before("UPDATE", "AssetRequests", (req) => {
      requireAnyRole(
        req,
        ["Employee", "HRApprover", "Admin"],
        "Updating an asset request"
      );
    });

    this.before("DELETE", "AssetRequests", (req) => {
      requireAnyRole(
        req,
        ["Employee", "HRApprover", "Admin"],
        "Deleting an asset request"
      );
    });

    this.before("submitRequest", "AssetRequests", (req) => {
      requireAnyRole(
        req,
        ["Employee", "HRApprover", "Admin"],
        "Submitting an asset request"
      );
    });

    this.before("approveRequest", "AssetRequests", (req) => {
      requireAnyRole(
        req,
        ["Approver", "Admin"],
        "Approving an asset request"
      );
    });

    this.before("rejectRequest", "AssetRequests", (req) => {
      requireAnyRole(
        req,
        ["Approver", "Admin"],
        "Rejecting an asset request"
      );
    });


    /**
     * Returns the authenticated user and application roles to the UI.
     */
    this.on("getCurrentUser", (req) => {
      return {
        id: req.user?.id || "anonymous",
        isEmployee: Boolean(req.user?.is("Employee")),
        isHRApprover: Boolean(req.user?.is("HRApprover")),
        isApprover: Boolean(req.user?.is("Approver")),
        isAdmin: Boolean(req.user?.is("Admin")),
      };
    });

    /**
     * DRAFT -> SUBMITTED
     */
    this.on("submitRequest", "AssetRequests", async (req) => {
      const requestId = getRequestId(req);
      const tx = cds.tx(req);

      const assetRequest = await readAssetRequest(tx, requestId, req);

      if (assetRequest.status !== "DRAFT") {
        return req.reject(
          400,
          `Only DRAFT requests can be submitted. Request ${requestId} currently has status ${assetRequest.status}.`
        );
      }

      await validateForSubmission(tx, assetRequest, req);

      await tx.run(
        UPDATE(AssetRequests)
          .set({
            status: "SUBMITTED",
            submittedAt: new Date().toISOString(),
            decisionComment: null,
            decidedAt: null,
            decidedBy: null,
          })
          .where({ ID: requestId })
      );

      return tx.run(
        SELECT.one.from(AssetRequests).where({ ID: requestId })
      );
    });

    /**
     * SUBMITTED -> APPROVED
     *
     * Also applies the related business change to the asset.
     */
    this.on("approveRequest", "AssetRequests", async (req) => {
      const requestId = getRequestId(req);
      const tx = cds.tx(req);

      const assetRequest = await readAssetRequest(tx, requestId, req);

      if (assetRequest.status !== "SUBMITTED") {
        return req.reject(
          400,
          `Only SUBMITTED requests can be approved. Request ${requestId} currently has status ${assetRequest.status}.`
        );
      }

      const asset = await readAsset(tx, assetRequest.asset_ID, req);
      const today = new Date().toISOString().slice(0, 10);

      switch (assetRequest.requestType) {
        case "ASSIGN": {
          const targetEmployee = await readActiveEmployee(
            tx,
            assetRequest.targetEmployee_ID,
            req,
            "Target employee"
          );

          if (asset.status !== "AVAILABLE") {
            return req.reject(
              400,
              `Asset ${asset.assetTag} is no longer available for assignment.`
            );
          }

          await tx.run(
            UPDATE(Assets)
              .set({
                status: "ASSIGNED",
                assignedTo_ID: targetEmployee.ID,
                assignedDate: today,
              })
              .where({ ID: asset.ID })
          );

          break;
        }

        case "TRANSFER": {
          const targetEmployee = await readActiveEmployee(
            tx,
            assetRequest.targetEmployee_ID,
            req,
            "Target employee"
          );

          if (asset.status !== "ASSIGNED") {
            return req.reject(
              400,
              `Asset ${asset.assetTag} must be assigned before transfer.`
            );
          }

          if (asset.assignedTo_ID === targetEmployee.ID) {
            return req.reject(
              400,
              `Asset ${asset.assetTag} is already assigned to ${targetEmployee.fullName}.`
            );
          }

          await tx.run(
            UPDATE(Assets)
              .set({
                assignedTo_ID: targetEmployee.ID,
                assignedDate: today,
              })
              .where({ ID: asset.ID })
          );

          break;
        }

        case "RETURN": {
          if (asset.status !== "ASSIGNED") {
            return req.reject(
              400,
              `Asset ${asset.assetTag} is not currently assigned.`
            );
          }

          if (asset.assignedTo_ID !== assetRequest.requester_ID) {
            return req.reject(
              400,
              `Asset ${asset.assetTag} is not assigned to the employee who requested the return.`
            );
          }

          await tx.run(
            UPDATE(Assets)
              .set({
                status: "AVAILABLE",
                assignedTo_ID: null,
                assignedDate: null,
              })
              .where({ ID: asset.ID })
          );

          break;
        }

        case "UPDATE": {
          /*
           * UPDATE requests currently represent approval of a requested
           * change. The actual asset fields will be introduced later
           * through dedicated proposed-value fields.
           */
          break;
        }

        default:
          return req.reject(
            400,
            `Unsupported request type: ${assetRequest.requestType}.`
          );
      }

      const approver =
        req.user?.id && req.user.id !== "anonymous"
          ? req.user.id
          : "local-approver";

      await tx.run(
        UPDATE(AssetRequests)
          .set({
            status: "APPROVED",
            decisionComment:
              req.data.decisionComment || "Approved",
            decidedAt: new Date().toISOString(),
            decidedBy: approver,
          })
          .where({ ID: requestId })
      );

      return tx.run(
        SELECT.one.from(AssetRequests).where({ ID: requestId })
      );
    });

    /**
     * SUBMITTED -> REJECTED
     */
    this.on("rejectRequest", "AssetRequests", async (req) => {
      const requestId = getRequestId(req);
      const tx = cds.tx(req);

      const assetRequest = await readAssetRequest(tx, requestId, req);

      if (assetRequest.status !== "SUBMITTED") {
        return req.reject(
          400,
          `Only SUBMITTED requests can be rejected. Request ${requestId} currently has status ${assetRequest.status}.`
        );
      }

      const decisionComment = req.data.decisionComment?.trim();

      if (!decisionComment) {
        return req.reject(
          400,
          "A decision comment is required when rejecting a request."
        );
      }

      const approver =
        req.user?.id && req.user.id !== "anonymous"
          ? req.user.id
          : "local-approver";

      await tx.run(
        UPDATE(AssetRequests)
          .set({
            status: "REJECTED",
            decisionComment,
            decidedAt: new Date().toISOString(),
            decidedBy: approver,
          })
          .where({ ID: requestId })
      );

      return tx.run(
        SELECT.one.from(AssetRequests).where({ ID: requestId })
      );
    });

    return super.init();
  }
};