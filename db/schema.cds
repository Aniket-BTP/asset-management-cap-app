namespace asset.management;

using { managed } from '@sap/cds/common';

type AssetStatus : String enum {
    Available   = 'AVAILABLE';
    Assigned    = 'ASSIGNED';
    Maintenance = 'MAINTENANCE';
    Retired     = 'RETIRED';
}

type RequestType : String enum {
    Assign   = 'ASSIGN';
    Transfer = 'TRANSFER';
    Return   = 'RETURN';
    Update   = 'UPDATE';
}

type RequestStatus : String enum {
    Draft     = 'DRAFT';
    Submitted = 'SUBMITTED';
    Approved  = 'APPROVED';
    Rejected  = 'REJECTED';
}

entity Employees : managed {
    key ID        : Integer;
        employeeNo : String(20)  not null;
        fullName   : String(100) not null;
        email      : String(255) not null;
        department : String(80);
        managerEmail : String(255);
        active     : Boolean default true;
}

entity Assets : managed {
    key ID           : Integer;
        assetTag      : String(30)  not null;
        assetType     : String(50)  not null;
        brand         : String(50);
        model         : String(80);
        serialNumber  : String(80);
        status        : AssetStatus default 'AVAILABLE';
        purchaseDate  : Date;
        warrantyEnd   : Date;
        assignedTo    : Association to Employees;
        assignedDate  : Date;
        location      : String(100);
        assetValue    : Decimal(13,2);
        currency      : String(3) default 'INR';
        notes         : String(500);
}

entity AssetRequests : managed {
    key ID             : Integer;
        requestType     : RequestType not null;
        asset           : Association to Assets;
        requester       : Association to Employees not null;
        targetEmployee  : Association to Employees;
        reason          : String(500);
        status          : RequestStatus default 'DRAFT';
        decisionComment : String(500);
        submittedAt     : Timestamp;
        decidedAt       : Timestamp;
        decidedBy       : String(255);
}